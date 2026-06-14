import UIKit

@objc class SplineLowerContainerView: UIView {
  @objc dynamic var sceneUrl: NSString? {
    didSet { _ = sceneUrl }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    backgroundColor = .black
  }
}
