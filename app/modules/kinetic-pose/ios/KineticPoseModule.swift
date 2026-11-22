import AVFoundation
import ExpoModulesCore

/// Exposes the camera permission and the live pose camera view to JavaScript.
public class KineticPoseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KineticPose")

    /// "granted" | "denied" | "restricted" | "undetermined", without asking.
    Function("getCameraPermission") { () -> String in
      return KineticPoseModule.permissionString(AVCaptureDevice.authorizationStatus(for: .video))
    }

    /// Shows the system prompt the first time; afterwards returns the stored answer.
    AsyncFunction("requestCameraPermission") { (promise: Promise) in
      let status = AVCaptureDevice.authorizationStatus(for: .video)
      if status == .notDetermined {
        AVCaptureDevice.requestAccess(for: .video) { granted in
          promise.resolve(granted ? "granted" : "denied")
        }
      } else {
        promise.resolve(KineticPoseModule.permissionString(status))
      }
    }

    View(KineticPoseView.self) {
      Events("onPose", "onStatus")

      Prop("facing") { (view: KineticPoseView, facing: String) in
        view.setFacing(facing == "environment" ? .back : .front)
      }
    }
  }

  static func permissionString(_ status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "undetermined"
    @unknown default: return "denied"
    }
  }
}
