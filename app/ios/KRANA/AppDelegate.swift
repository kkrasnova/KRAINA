internal import Expo
import React
import ReactAppDependencyProvider

// @generated begin react-native-maps-import - expo prebuild (DO NOT MODIFY) sync-bee50fec513f89284e0fa3f5d935afdde33af98f
#if canImport(GoogleMaps)
import GoogleMaps
#endif
// @generated end react-native-maps-import
@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
#if DEBUG && !targetEnvironment(simulator)
  private var bonjourBrowser: NetServiceBrowser?
#endif

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if DEBUG && !targetEnvironment(simulator)
    triggerLocalNetworkPermission()
#endif

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

// @generated begin react-native-maps-init - expo prebuild (DO NOT MODIFY) sync-5e7d39761b2bf85de33ba4f1a0d7e6464585c2a9
#if canImport(GoogleMaps)
GMSServices.provideAPIKey("AIzaSyDvx5JcpyKpdv_YoAWv-3ddtbiMcp6lIlk")
#endif
// @generated end react-native-maps-init
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

#if DEBUG && !targetEnvironment(simulator)
  private func triggerLocalNetworkPermission() {
    bonjourBrowser = NetServiceBrowser()
    bonjourBrowser?.searchForServices(ofType: "_http._tcp.", inDomain: "local.")
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
      self?.bonjourBrowser?.stop()
      self?.bonjourBrowser = nil
    }
  }
#endif

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
#if DEBUG
    return bundleURL()
#else
    return bridge.bundleURL ?? bundleURL()
#endif
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return debugMetroBundleURL()
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }

  private func debugMetroBundleURL() -> URL? {
    let bundleRoot = ".expo/.virtual-metro-entry"
    let provider = RCTBundleURLProvider.sharedSettings()

    #if targetEnvironment(simulator)
    if let url = provider.jsBundleURL(forBundleRoot: bundleRoot) {
      return url
    }
    return provider.jsBundleURL(forBundleRoot: "index")
    #else
    if
      let ipPath = Bundle.main.path(forResource: "ip", ofType: "txt"),
      let ip = try? String(contentsOfFile: ipPath, encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !ip.isEmpty,
      ip != "127.0.0.1"
    {
      provider.jsLocation = "\(ip):8081"
      if let url = directMetroURL(host: ip, bundleRoot: bundleRoot) {
        return url
      }
    }

    if let url = provider.jsBundleURL(forBundleRoot: bundleRoot) {
      return url
    }
    return provider.jsBundleURL(forBundleRoot: "index")
    #endif
  }

  private func directMetroURL(host: String, bundleRoot: String) -> URL? {
    var components = URLComponents()
    components.scheme = "http"
    components.host = host
    components.port = 8081
    components.path = "/\(bundleRoot).bundle"
    components.queryItems = [
      URLQueryItem(name: "platform", value: "ios"),
      URLQueryItem(name: "dev", value: "true"),
      URLQueryItem(name: "minify", value: "false"),
      URLQueryItem(name: "lazy", value: "true"),
    ]
    return components.url
  }
}
