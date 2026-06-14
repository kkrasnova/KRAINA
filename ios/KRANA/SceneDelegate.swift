import UIKit

/// iOS 13+ window / React host — removes "does not adopt UIScene lifecycle" while keeping a single RN root.
@objc(SceneDelegate)
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    guard let factory = appDelegate.reactNativeFactory else { return }

    let win = UIWindow(windowScene: windowScene)
    window = win
    appDelegate.window = win

    factory.startReactNative(
      withModuleName: "main",
      in: win,
      launchOptions: AppDelegate.pendingLaunchOptions
    )
  }
}
