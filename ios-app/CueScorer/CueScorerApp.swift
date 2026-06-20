import SwiftUI
import UIKit
import WebKit

@main
struct CueScorerApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainer()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}

/// Hosts a WKWebView that loads the bundled web app (in Resources/web) through a
/// custom URL scheme. A custom scheme gives the page a stable origin, so
/// localStorage (player profiles, stats, saved games) persists across launches.
struct WebContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.websiteDataStore = .default()      // persistent storage

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.024, green: 0.051, blue: 0.039, alpha: 1)
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        if let start = URL(string: "\(BundleSchemeHandler.scheme)://local/index.html") {
            webView.load(URLRequest(url: start))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "cuescorer"

    private var webRoot: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("web")
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let root = webRoot else {
            task.didFailWithError(URLError(.badURL)); return
        }

        var rel = url.path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "index.html" }

        let fileURL = root.appendingPathComponent(rel).standardizedFileURL
        // Prevent escaping the web root.
        guard fileURL.path.hasPrefix(root.standardizedFileURL.path),
              let data = try? Data(contentsOf: fileURL) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }

        let response = HTTPURLResponse(
            url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": Self.mimeType(for: fileURL.pathExtension),
                           "Cache-Control": "no-cache"]
        )!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "json", "webmanifest": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "ico": return "image/x-icon"
        default: return "application/octet-stream"
        }
    }
}
