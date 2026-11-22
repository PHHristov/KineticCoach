Pod::Spec.new do |s|
  s.name           = 'KineticPose'
  s.version        = '1.0.0'
  s.summary        = 'Camera + MediaPipe pose landmarks for KineticCoach form checks'
  s.description    = 'Runs the MediaPipe Pose Landmarker on live camera frames and sends body landmarks to JavaScript.'
  s.author         = 'KineticCoach'
  s.homepage       = 'https://github.com/PHHristov/KineticCoach'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Google's MediaPipe Tasks for iOS (same pose model as the web version).
  s.dependency 'MediaPipeTasksVision', '1.0.1'

  s.source_files   = '*.swift'
  # The pose model is bundled so form checks work offline.
  s.resource_bundles = { 'KineticPoseResources' => ['Resources/*.task'] }
  s.swift_version  = '5.9'
end
