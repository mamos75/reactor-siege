// /Users/mamospower/chain-reactors/iOS/ReactorSiege/Bomb.swift
// Reactor Siege — Bomb entity: countdown, visual node, detonation trigger

import SpriteKit

// MARK: - Bomb
class Bomb {

    // MARK: Identity
    let id: UUID = UUID()
    let type: BombType

    // MARK: Grid position
    var col: Int
    var row: Int

    // MARK: Countdown
    var timeRemaining: TimeInterval
    var totalTime: TimeInterval
    var isArmed: Bool = true     // false after detonation to prevent double-trigger

    // MARK: Visual node
    let node: SKNode = SKNode()
    private let bodyRect: SKShapeNode
    private let countdownArc: SKShapeNode
    private let labelNode: SKLabelNode

    // MARK: Init
    init(type: BombType, col: Int, row: Int, delay: TimeInterval) {
        self.type          = type
        self.col           = col
        self.row           = row
        self.timeRemaining = delay
        self.totalTime     = delay

        let s: CGFloat = GC.tileSize * 0.72
        let half = s * 0.5

        // Pulsing body rectangle
        bodyRect = SKShapeNode(rectOf: CGSize(width: s, height: s), cornerRadius: 6)
        bodyRect.fillColor   = type.color.withAlphaComponent(0.7)
        bodyRect.strokeColor = type.color
        bodyRect.lineWidth   = 3
        bodyRect.zPosition   = 6

        // Countdown arc (starts full, shrinks)
        countdownArc = SKShapeNode()
        countdownArc.strokeColor = .white
        countdownArc.lineWidth   = 3
        countdownArc.fillColor   = .clear
        countdownArc.zPosition   = 7

        // Bomb type label
        labelNode = SKLabelNode(text: String(type.displayName.prefix(1)))
        labelNode.fontName      = "AvenirNext-Bold"
        labelNode.fontSize      = 18
        labelNode.fontColor     = .white
        labelNode.verticalAlignmentMode   = .center
        labelNode.horizontalAlignmentMode = .center
        labelNode.zPosition     = 8

        node.addChild(bodyRect)
        node.addChild(countdownArc)
        node.addChild(labelNode)
        node.zPosition = 6

        // Pulse body
        let pulse = SKAction.sequence([
            SKAction.scale(to: 1.08, duration: 0.3),
            SKAction.scale(to: 0.96, duration: 0.3)
        ])
        bodyRect.run(SKAction.repeatForever(pulse))

        updateCountdownArc()
        positionInScene()
    }

    // MARK: Scene position
    static func scenePos(col: Int, row: Int) -> CGPoint {
        let x = GC.gridOffsetX + CGFloat(col) * GC.tileSize + GC.tileSize * 0.5
        let y = GC.gridOffsetY + CGFloat(row) * GC.tileSize + GC.tileSize * 0.5
        return CGPoint(x: x, y: y)
    }

    func positionInScene() {
        node.position = Bomb.scenePos(col: col, row: row)
    }

    // MARK: Countdown arc visual
    private func updateCountdownArc() {
        let fraction = CGFloat(timeRemaining / totalTime)
        let radius: CGFloat = GC.tileSize * 0.44
        let startAngle = CGFloat.pi * 0.5                       // 12 o'clock
        let endAngle   = startAngle + fraction * CGFloat.pi * 2

        let path = CGMutablePath()
        path.addArc(center: .zero,
                    radius: radius,
                    startAngle: startAngle,
                    endAngle: endAngle,
                    clockwise: false)
        countdownArc.path = path
    }

    // MARK: Update — returns true when countdown expires
    @discardableResult
    func update(dt: TimeInterval) -> Bool {
        guard isArmed else { return false }
        timeRemaining -= dt
        updateCountdownArc()

        // Flash red when < 30% time remaining (start only once)
        if timeRemaining / totalTime < 0.3 && bodyRect.action(forKey: "flash") == nil {
            let flash = SKAction.sequence([
                SKAction.colorize(with: .red, colorBlendFactor: 0.6, duration: 0.1),
                SKAction.colorize(with: type.color, colorBlendFactor: 0, duration: 0.1)
            ])
            bodyRect.run(SKAction.repeatForever(flash), withKey: "flash")
        }

        if timeRemaining <= 0 {
            isArmed = false
            return true
        }
        return false
    }

    // MARK: Force detonate (used by CHAIN reaction)
    func forceDetonate() {
        isArmed       = false
        timeRemaining = 0
    }

    // MARK: Explosion overlay at a given blast cell
    /// Returns a flash node added to the scene by the caller; auto-removes itself.
    static func explosionFlash(at pos: CGPoint, color: UIColor) -> SKShapeNode {
        let s = GC.tileSize - 2
        let shape = SKShapeNode(rectOf: CGSize(width: s, height: s))
        shape.fillColor   = color.withAlphaComponent(0.85)
        shape.strokeColor = color
        shape.lineWidth   = 2
        shape.position    = pos
        shape.zPosition   = 9
        shape.run(SKAction.sequence([
            SKAction.wait(forDuration: 0.05),
            SKAction.group([
                SKAction.scale(to: 1.25, duration: 0.25),
                SKAction.fadeOut(withDuration: 0.28)
            ]),
            SKAction.removeFromParent()
        ]))
        return shape
    }

    // MARK: Remove node
    func remove() {
        node.removeFromParent()
    }
}
