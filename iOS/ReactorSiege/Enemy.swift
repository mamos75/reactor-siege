// /Users/mamospower/chain-reactors/iOS/ReactorSiege/Enemy.swift
// Reactor Siege — Enemy entity: CHASER, SABOTEUR, COWARD with AI behaviour

import SpriteKit

// MARK: - Enemy
class Enemy {

    // MARK: Identity
    let id: UUID = UUID()
    let type: EnemyType

    // MARK: Grid position
    var col: Int
    var row: Int

    // MARK: Stats
    var hp: Int
    var isFrozen: Bool = false
    var frozenTimer: TimeInterval = 0
    var speedMult: Double = 1.0

    // Movement timer
    var moveTimer: TimeInterval = 0

    // MARK: Visual node
    let node: SKNode = SKNode()
    private let bodyNode: SKShapeNode
    private let indicatorNode: SKShapeNode   // small shape showing enemy type

    // MARK: Init
    init(type: EnemyType, col: Int, row: Int, speedMult: Double = 1.0) {
        self.type      = type
        self.col       = col
        self.row       = row
        self.hp        = type.hp
        self.speedMult = speedMult

        let r: CGFloat = GC.tileSize * 0.36
        // Outer glow halo
        let glow = SKShapeNode(circleOfRadius: r + 5)
        glow.fillColor   = type.color.withAlphaComponent(0.15)
        glow.strokeColor = type.color.withAlphaComponent(0.5)
        glow.lineWidth   = 1.5
        glow.zPosition   = 3

        // Body
        bodyNode = SKShapeNode(circleOfRadius: r)
        bodyNode.fillColor   = type.color
        bodyNode.strokeColor = .white
        bodyNode.lineWidth   = 2
        bodyNode.zPosition   = 4

        // Type indicator
        switch type {
        case .chaser:
            // Small forward triangle
            let path = CGMutablePath()
            path.move(to: CGPoint(x: 0, y: r * 0.55))
            path.addLine(to: CGPoint(x: -r * 0.38, y: -r * 0.38))
            path.addLine(to: CGPoint(x:  r * 0.38, y: -r * 0.38))
            path.closeSubpath()
            indicatorNode = SKShapeNode(path: path)
            indicatorNode.fillColor   = .white
            indicatorNode.strokeColor = .clear

        case .saboteur:
            // Diamond (rotated square)
            let d: CGFloat = r * 0.45
            let path = CGMutablePath()
            path.move(to: CGPoint(x: 0,  y:  d))
            path.addLine(to: CGPoint(x:  d, y:  0))
            path.addLine(to: CGPoint(x:  0, y: -d))
            path.addLine(to: CGPoint(x: -d, y:  0))
            path.closeSubpath()
            indicatorNode = SKShapeNode(path: path)
            indicatorNode.fillColor   = .white
            indicatorNode.strokeColor = .clear

        case .coward:
            // Small circle exclamation dot
            indicatorNode = SKShapeNode(circleOfRadius: r * 0.28)
            indicatorNode.fillColor   = .black
            indicatorNode.strokeColor = .clear
        }
        indicatorNode.zPosition = 5

        node.addChild(glow)
        node.addChild(bodyNode)
        node.addChild(indicatorNode)
        node.zPosition = 4

        // Pulse animation on glow
        let pulse = SKAction.sequence([
            SKAction.fadeAlpha(to: 0.05, duration: 0.7),
            SKAction.fadeAlpha(to: 0.4,  duration: 0.7)
        ])
        glow.run(SKAction.repeatForever(pulse))

        snapToGrid()
    }

    // MARK: Scene position helper
    static func scenePos(col: Int, row: Int) -> CGPoint {
        let x = GC.gridOffsetX + CGFloat(col) * GC.tileSize + GC.tileSize * 0.5
        let y = GC.gridOffsetY + CGFloat(row) * GC.tileSize + GC.tileSize * 0.5
        return CGPoint(x: x, y: y)
    }

    func snapToGrid() {
        node.position = Enemy.scenePos(col: col, row: row)
    }

    // MARK: Move to cell (animated)
    func moveTo(col: Int, row: Int) {
        self.col = col
        self.row = row
        let dest = Enemy.scenePos(col: col, row: row)
        let dur  = 0.18 / speedMult
        node.run(SKAction.move(to: dest, duration: dur), withKey: "move")
    }

    // MARK: Update — returns true if the enemy should move this tick
    func update(dt: TimeInterval) -> Bool {
        if isFrozen {
            frozenTimer -= dt
            if frozenTimer <= 0 {
                isFrozen = false
                frozenTimer = 0
                bodyNode.color = type.color
                bodyNode.colorBlendFactor = 0
            }
            return false
        }

        moveTimer += dt
        let interval = type.baseMoveInterval / speedMult
        if moveTimer >= interval {
            moveTimer = 0
            return true
        }
        return false
    }

    // MARK: Freeze (CRYO)
    func freeze(duration: TimeInterval) {
        isFrozen    = true
        frozenTimer = duration
        // Tint body blue
        bodyNode.fillColor = UIColor(hex: "#aaddff")
    }

    // MARK: Damage
    @discardableResult
    func takeDamage(_ amount: Int = 1) -> Bool {
        hp -= amount
        if hp <= 0 { return true }   // dead
        // Flash white
        let flash = SKAction.sequence([
            SKAction.colorize(with: .white, colorBlendFactor: 0.8, duration: 0.05),
            SKAction.colorize(with: type.color, colorBlendFactor: 0, duration: 0.1)
        ])
        bodyNode.run(flash)
        return false
    }

    // MARK: Death particles (returned to caller for addition to scene)
    func deathParticles() -> [SKShapeNode] {
        var particles: [SKShapeNode] = []
        let origin = node.position

        switch type {
        case .chaser:
            // 8 orange sparks radially
            for i in 0..<8 {
                let angle = CGFloat(i) / 8.0 * CGFloat.pi * 2
                let spark = SKShapeNode(circleOfRadius: 4)
                spark.fillColor   = GC.colorChaser
                spark.strokeColor = .clear
                spark.position    = origin
                spark.zPosition   = 10
                let dx = cos(angle) * 48
                let dy = sin(angle) * 48
                spark.run(SKAction.sequence([
                    SKAction.group([
                        SKAction.move(by: CGVector(dx: dx, dy: dy), duration: 0.45),
                        SKAction.fadeOut(withDuration: 0.45)
                    ]),
                    SKAction.removeFromParent()
                ]))
                particles.append(spark)
            }

        case .saboteur:
            // 6 magenta diamonds
            for i in 0..<6 {
                let angle = CGFloat(i) / 6.0 * CGFloat.pi * 2
                let d: CGFloat = 6
                let path = CGMutablePath()
                path.move(to: CGPoint(x: 0, y: d))
                path.addLine(to: CGPoint(x: d, y: 0))
                path.addLine(to: CGPoint(x: 0, y: -d))
                path.addLine(to: CGPoint(x: -d, y: 0))
                path.closeSubpath()
                let shape = SKShapeNode(path: path)
                shape.fillColor   = GC.colorSaboteur
                shape.strokeColor = .clear
                shape.position    = origin
                shape.zPosition   = 10
                let dx = cos(angle) * 40
                let dy = sin(angle) * 40
                shape.run(SKAction.sequence([
                    SKAction.group([
                        SKAction.move(by: CGVector(dx: dx, dy: dy), duration: 0.4),
                        SKAction.rotate(byAngle: CGFloat.pi * 2, duration: 0.4),
                        SKAction.fadeOut(withDuration: 0.4)
                    ]),
                    SKAction.removeFromParent()
                ]))
                particles.append(shape)
            }

        case .coward:
            // 12 yellow burst particles
            for i in 0..<12 {
                let angle = CGFloat(i) / 12.0 * CGFloat.pi * 2
                let rect = CGRect(x: -3, y: -3, width: 6, height: 6)
                let shape = SKShapeNode(rect: rect)
                shape.fillColor   = GC.colorCoward
                shape.strokeColor = .clear
                shape.position    = origin
                shape.zPosition   = 10
                let dist: CGFloat = 36 + CGFloat.random(in: 0...20)
                let dx = cos(angle) * dist
                let dy = sin(angle) * dist
                shape.run(SKAction.sequence([
                    SKAction.group([
                        SKAction.move(by: CGVector(dx: dx, dy: dy), duration: 0.5),
                        SKAction.scale(to: 0.1, duration: 0.5),
                        SKAction.fadeOut(withDuration: 0.5)
                    ]),
                    SKAction.removeFromParent()
                ]))
                particles.append(shape)
            }
        }

        return particles
    }

    // MARK: Remove node from parent
    func remove() {
        node.removeFromParent()
    }
}
