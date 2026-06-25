// /Users/mamospower/chain-reactors/iOS/ReactorSiege/Player.swift
// Reactor Siege — Player entity: movement, invincibility, node management

import SpriteKit

// MARK: - Player
class Player {

    // MARK: Grid position
    var col: Int = GC.playerStartCol
    var row: Int = GC.playerStartRow

    // MARK: State
    var isAlive: Bool = true
    var isInvincible: Bool = false
    var invincibleTimer: TimeInterval = 0
    var moveCooldownTimer: TimeInterval = 0

    // MARK: Visual node
    let node: SKNode = SKNode()
    private let bodyCircle: SKShapeNode
    private let glowCircle: SKShapeNode

    // MARK: Init
    init() {
        let r: CGFloat = GC.tileSize * 0.38
        // Outer glow
        glowCircle = SKShapeNode(circleOfRadius: r + 6)
        glowCircle.fillColor   = GC.colorPlayer.withAlphaComponent(0.25)
        glowCircle.strokeColor = GC.colorPlayer.withAlphaComponent(0.6)
        glowCircle.lineWidth   = 2
        glowCircle.zPosition   = 4

        // Inner body
        bodyCircle = SKShapeNode(circleOfRadius: r)
        bodyCircle.fillColor   = GC.colorPlayer
        bodyCircle.strokeColor = .white
        bodyCircle.lineWidth   = 2
        bodyCircle.zPosition   = 5

        node.addChild(glowCircle)
        node.addChild(bodyCircle)
        node.zPosition = 5

        // Pulsing glow animation
        let pulse = SKAction.sequence([
            SKAction.fadeAlpha(to: 0.1, duration: 0.6),
            SKAction.fadeAlpha(to: 0.5, duration: 0.6)
        ])
        glowCircle.run(SKAction.repeatForever(pulse))
    }

    // MARK: Scene position from grid coords
    static func scenePos(col: Int, row: Int) -> CGPoint {
        let x = GC.gridOffsetX + CGFloat(col) * GC.tileSize + GC.tileSize * 0.5
        let y = GC.gridOffsetY + CGFloat(row) * GC.tileSize + GC.tileSize * 0.5
        return CGPoint(x: x, y: y)
    }

    // MARK: Snap node to current grid position (no animation)
    func snapToGrid() {
        node.position = Player.scenePos(col: col, row: row)
    }

    // MARK: Animated move to new grid cell
    func moveTo(col: Int, row: Int) {
        self.col = col
        self.row = row
        let dest = Player.scenePos(col: col, row: row)
        let move = SKAction.move(to: dest, duration: GC.moveDuration)
        move.timingMode = .easeInEaseOut
        node.run(move, withKey: "move")
        moveCooldownTimer = GC.moveCooldown
    }

    // MARK: Hit (called by GameScene)
    func hit() {
        guard !isInvincible else { return }
        isInvincible      = true
        invincibleTimer   = GC.invincibleDuration
        startFlicker()
    }

    // MARK: Invincibility flicker
    private func startFlicker() {
        let flicker = SKAction.sequence([
            SKAction.fadeAlpha(to: 0.2, duration: 0.12),
            SKAction.fadeAlpha(to: 1.0, duration: 0.12)
        ])
        node.run(SKAction.repeatForever(flicker), withKey: "flicker")
    }

    func stopFlicker() {
        node.removeAction(forKey: "flicker")
        node.alpha = 1
    }

    // MARK: Update
    func update(dt: TimeInterval) {
        if moveCooldownTimer > 0 {
            moveCooldownTimer -= dt
        }
        if isInvincible {
            invincibleTimer -= dt
            if invincibleTimer <= 0 {
                isInvincible    = false
                invincibleTimer = 0
                stopFlicker()
            }
        }
    }

    // MARK: Death
    func die() {
        isAlive = false
        node.run(SKAction.sequence([
            SKAction.scale(to: 1.6, duration: 0.12),
            SKAction.fadeOut(withDuration: 0.2),
            SKAction.removeFromParent()
        ]))
    }

    // MARK: Reset
    func reset() {
        col = GC.playerStartCol
        row = GC.playerStartRow
        isAlive         = true
        isInvincible    = false
        invincibleTimer = 0
        moveCooldownTimer = 0
        node.alpha = 1
        stopFlicker()
        snapToGrid()
    }
}
