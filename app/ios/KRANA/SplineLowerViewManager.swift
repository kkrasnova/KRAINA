import React
import UIKit

@objc(SplineLowerViewManager)
class SplineLowerViewManager: RCTViewManager {
  override func view() -> UIView! {
    SplineLowerContainerView()
  }

  @objc override static func requiresMainQueueSetup() -> Bool {
    true
  }
}
