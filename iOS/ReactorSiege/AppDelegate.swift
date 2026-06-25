// /Users/mamospower/chain-reactors/iOS/ReactorSiege/AppDelegate.swift
// Reactor Siege — Standard iOS AppDelegate with SpriteKit scene setup

import UIKit
import SpriteKit

// MARK: - AppDelegate
@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        window = UIWindow(frame: UIScreen.main.bounds)

        let viewController = GameViewController()
        window?.rootViewController = viewController
        window?.makeKeyAndVisible()

        return true
    }
}

// MARK: - GameViewController
class GameViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(hex: "#050510")
    }

    override func loadView() {
        // Use SKView as the main view
        let skView = SKView(frame: UIScreen.main.bounds)
        skView.ignoresSiblingOrder = true
        skView.showsFPS   = false
        skView.showsNodeCount = false
        view = skView
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let skView = view as? SKView else { return }

        // Present the scene scaled to fit the device screen
        let scene = GameScene(size: CGSize(width: GC.canvasWidth, height: GC.canvasHeight))
        scene.scaleMode = .aspectFit
        scene.backgroundColor = UIColor(hex: "#050510")
        skView.presentScene(scene)
    }

    override var prefersStatusBarHidden: Bool { return true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { return .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { return .landscapeLeft }
}
