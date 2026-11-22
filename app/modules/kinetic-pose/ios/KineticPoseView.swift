import AVFoundation
import ExpoModulesCore
import MediaPipeTasksVision
import UIKit

/// Camera preview + MediaPipe Pose Landmarker running on every frame.
/// Sends 33 body landmarks (image and 3D world coordinates) to JavaScript via `onPose`.
public class KineticPoseView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate, PoseLandmarkerLiveStreamDelegate {
  let onPose = EventDispatcher()
  let onStatus = EventDispatcher()

  private let session = AVCaptureSession()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let videoOutput = AVCaptureVideoDataOutput()
  /// All camera and model work happens on this queue, never on the UI thread.
  private let queue = DispatchQueue(label: "com.kineticcoach.pose")
  private var landmarker: PoseLandmarker?
  private var position: AVCaptureDevice.Position = .front
  private var configured = false
  private var running = false
  private var lastTimestampMs = 0
  /// The camera position the frame connection was last set up for (rotation + mirroring).
  private var connectionReadyFor: AVCaptureDevice.Position?
  private var sidewaysFrames = 0
  /// When each frame was handed to the model and its size, keyed by timestamp.
  /// MediaPipe answers on its own thread, so access goes through `lock`.
  private var pending: [Int: (sent: CFTimeInterval, size: CGSize)] = [:]
  private let lock = NSLock()

  public required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: session)
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    // Letterboxed like the web version, so the overlay maps 1:1 onto the picture.
    previewLayer.videoGravity = .resizeAspect
    layer.addSublayer(previewLayer)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { start() } else { stop() }
  }

  deinit {
    session.stopRunning()
  }

  func setFacing(_ newPosition: AVCaptureDevice.Position) {
    queue.async {
      guard newPosition != self.position else { return }
      self.position = newPosition
      if self.configured { self.configureInput() }
    }
  }

  // MARK: - Lifecycle

  private func start() {
    queue.async {
      guard !self.running else { return }
      self.status("starting", "Starting the camera…")
      if !self.configured {
        guard self.configureSession() else { return }
      }
      if self.landmarker == nil {
        self.status("starting", "Loading the pose model…")
        guard self.makeLandmarker() else { return }
      }
      self.session.startRunning()
      self.running = true
      self.status("running", nil)
    }
  }

  private func stop() {
    queue.async {
      guard self.running else { return }
      self.session.stopRunning()
      self.running = false
    }
  }

  // MARK: - Camera

  private func configureSession() -> Bool {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      status("error", "Camera access is off. Allow it in Settings → KineticCoach → Camera.", action: "settings")
      return false
    }
    session.beginConfiguration()
    session.sessionPreset = .hd1280x720
    videoOutput.alwaysDiscardsLateVideoFrames = true
    // MediaPipe expects 32BGRA frames.
    videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    videoOutput.setSampleBufferDelegate(self, queue: queue)
    if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
    session.commitConfiguration()
    configured = true
    return configureInput()
  }

  @discardableResult
  private func configureInput() -> Bool {
    session.beginConfiguration()
    session.inputs.forEach { session.removeInput($0) }
    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
        ?? AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input)
    else {
      session.commitConfiguration()
      status("error", "No camera is available on this device.")
      return false
    }
    session.addInput(input)
    session.commitConfiguration()
    // Set up rotation + mirroring before frames flow (as Google's sample does); frames re-check it too.
    if let connection = videoOutput.connection(with: .video) { prepare(connection) }
    return true
  }

  // MARK: - Model

  private func makeLandmarker() -> Bool {
    guard
      let bundleURL = Bundle(for: KineticPoseView.self).url(forResource: "KineticPoseResources", withExtension: "bundle"),
      let modelPath = Bundle(url: bundleURL)?.path(forResource: "pose_landmarker_lite", ofType: "task")
    else {
      status("error", "The pose model is missing from the app.")
      return false
    }
    func options(_ delegate: Delegate) -> PoseLandmarkerOptions {
      let options = PoseLandmarkerOptions()
      options.baseOptions.modelAssetPath = modelPath
      options.baseOptions.delegate = delegate
      options.runningMode = .liveStream
      options.numPoses = 1
      options.minPoseDetectionConfidence = 0.5
      options.minPosePresenceConfidence = 0.5
      options.minTrackingConfidence = 0.5
      options.poseLandmarkerLiveStreamDelegate = self
      return options
    }
    // GPU is fastest; fall back to the CPU where the GPU path isn't available (e.g. the Simulator).
    if let gpu = try? PoseLandmarker(options: options(.GPU)) {
      landmarker = gpu
      return true
    }
    do {
      landmarker = try PoseLandmarker(options: options(.CPU))
      return true
    } catch {
      status("error", "Could not start pose tracking: \(error.localizedDescription)")
      return false
    }
  }

  /// Upright portrait frames, mirrored for the front camera, so landmark x/y match the preview.
  /// Done on the delivering connection: settings applied before the session starts can be ignored.
  private func prepare(_ connection: AVCaptureConnection) {
    // Both settings ask for the same portrait rotation; some devices honour only one of them.
    if #available(iOS 17.0, *), connection.isVideoRotationAngleSupported(90) {
      connection.videoRotationAngle = 90
    }
    // Older setting, also what Google's MediaPipe iOS sample uses.
    if connection.isVideoOrientationSupported {
      connection.videoOrientation = .portrait
    }
    if connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = (position == .front)
    }
    connectionReadyFor = position
  }

  public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    if connectionReadyFor != position {
      // This frame was produced before the change; the next ones come out upright.
      prepare(connection)
      return
    }
    guard let landmarker = landmarker, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    // Safety net: never hand MediaPipe a sideways frame.
    if CVPixelBufferGetWidth(pixelBuffer) > CVPixelBufferGetHeight(pixelBuffer) {
      sidewaysFrames += 1
      if sidewaysFrames == 30 {
        var angle = "n/a"
        if #available(iOS 17.0, *) { angle = connection.isVideoRotationAngleSupported(90) ? "yes" : "no" }
        status(
          "error",
          "The camera couldn't be turned to portrait on this device, so pose tracking can't run. " +
            "(Details: rotation angle \(angle), orientation \(connection.isVideoOrientationSupported ? "yes" : "no"), " +
            "frame \(CVPixelBufferGetWidth(pixelBuffer))×\(CVPixelBufferGetHeight(pixelBuffer)))"
        )
      }
      prepare(connection)
      return
    }
    sidewaysFrames = 0
    let size = CGSize(width: CVPixelBufferGetWidth(pixelBuffer), height: CVPixelBufferGetHeight(pixelBuffer))
    // Live-stream mode needs strictly increasing timestamps in milliseconds.
    var ms = Int(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000)
    if ms <= lastTimestampMs { ms = lastTimestampMs + 1 }
    lastTimestampMs = ms
    do {
      let image = try MPImage(sampleBuffer: sampleBuffer, orientation: .up)
      lock.lock()
      pending[ms] = (CACurrentMediaTime(), size)
      if pending.count > 60 { pending.removeAll() }
      lock.unlock()
      try landmarker.detectAsync(image: image, timestampInMilliseconds: ms)
    } catch {
      // A dropped frame is fine; the next one follows in ~33 ms.
    }
  }

  public func poseLandmarker(
    _ poseLandmarker: PoseLandmarker,
    didFinishDetection result: PoseLandmarkerResult?,
    timestampInMilliseconds: Int,
    error: Error?
  ) {
    lock.lock()
    let frame = pending.removeValue(forKey: timestampInMilliseconds)
    lock.unlock()
    let inferenceMs = frame.map { (CACurrentMediaTime() - $0.sent) * 1000 } ?? 0
    let frameSize = frame?.size ?? CGSize(width: 720, height: 1280)
    var image: [Double] = []
    var world: [Double] = []
    if let pose = result?.landmarks.first {
      image.reserveCapacity(pose.count * 4)
      for p in pose {
        image.append(contentsOf: [Double(p.x), Double(p.y), Double(p.z), p.visibility?.doubleValue ?? 0])
      }
    }
    if let pose = result?.worldLandmarks.first {
      world.reserveCapacity(pose.count * 4)
      for p in pose {
        world.append(contentsOf: [Double(p.x), Double(p.y), Double(p.z), p.visibility?.doubleValue ?? 0])
      }
    }
    let payload: [String: Any] = [
      "t": Double(timestampInMilliseconds),
      "inferenceMs": inferenceMs,
      "width": Double(frameSize.width),
      "height": Double(frameSize.height),
      "image": image,
      "world": world,
    ]
    DispatchQueue.main.async { [weak self] in self?.onPose(payload) }
  }

  // MARK: - Status

  private func status(_ kind: String, _ message: String?, action: String? = nil) {
    var payload: [String: Any] = ["kind": kind]
    if let message = message { payload["message"] = message }
    if let action = action { payload["action"] = action }
    DispatchQueue.main.async { [weak self] in self?.onStatus(payload) }
  }
}
