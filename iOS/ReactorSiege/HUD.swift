// /Users/mamospower/chain-reactors/iOS/ReactorSiege/HUD.swift
// Reactor Siege — Heads-Up Display: heat bar, energy bar, lives, wave, score, bomb selector

import SpriteKit

// MARK: - HUD
/// All HUD nodes are children of a dedicated SKNode owned by GameScene.
class HUD {

    // MARK: Root node
    let node: SKNode = SKNode()

    // MARK: Left panel refs
    private let heatBarBg:    SKShapeNode
    private let heatBarFill:  SKShapeNode
    private var heatLabel:    SKLabelNode
    private let critLabel:    SKLabelNode
    private let energyBarBg:  SKShapeNode
    private let energyBarFill: SKShapeNode
    private var energyLabel:  SKLabelNode
    private var heartNodes:   [SKShapeNode] = []

    // MARK: Right panel refs
    private var waveLabel:    SKLabelNode
    private var scoreLabel:   SKLabelNode
    private var dotNodes:     [SKShapeNode] = []
    private var bombCards:    [SKNode] = []
    private var bombHighlights: [SKShapeNode] = []

    // MARK: Bottom bar refs
    private var bombStatLabel: SKLabelNode
    private var hintLabel:     SKLabelNode

    // MARK: Overlay refs (upgrade, gameover, win, title)
    private var overlayNode: SKNode? = nil

    // MARK: Bar geometry
    private let barX:      CGFloat = 14
    private let barWidth:  CGFloat = 22
    private let heatBarY:  CGFloat = 540
    private let heatBarH:  CGFloat = 220
    private let energyBarY: CGFloat = 240
    private let energyBarH: CGFloat = 160

    // MARK: Init
    init() {
        // ---- LEFT PANEL BACKGROUND ----
        let leftBg = SKShapeNode(rectOf: CGSize(width: GC.hudLeftWidth, height: GC.canvasHeight))
        leftBg.fillColor   = UIColor(hex: "#050510").withAlphaComponent(0.92)
        leftBg.strokeColor = UIColor(hex: "#001133")
        leftBg.lineWidth   = 1
        leftBg.position    = CGPoint(x: GC.hudLeftWidth * 0.5, y: GC.canvasHeight * 0.5)
        leftBg.zPosition   = 20

        // REACTOR label
        let reactorLabel = SKLabelNode(text: "REACTOR")
        reactorLabel.fontName  = "AvenirNext-Bold"
        reactorLabel.fontSize  = 11
        reactorLabel.fontColor = GC.colorWallBorder
        reactorLabel.position  = CGPoint(x: GC.hudLeftWidth * 0.5, y: GC.canvasHeight - 20)
        reactorLabel.zPosition = 21

        // Heat bar background
        heatBarBg = SKShapeNode(rectOf: CGSize(width: barWidth, height: heatBarH), cornerRadius: 4)
        heatBarBg.fillColor   = UIColor(white: 0.15, alpha: 1)
        heatBarBg.strokeColor = GC.colorWallBorder.withAlphaComponent(0.5)
        heatBarBg.lineWidth   = 1
        heatBarBg.position    = CGPoint(x: barX + barWidth * 0.5, y: heatBarY + heatBarH * 0.5)
        heatBarBg.zPosition   = 21

        // Heat bar fill
        heatBarFill = SKShapeNode(rectOf: CGSize(width: barWidth - 4, height: 2), cornerRadius: 3)
        heatBarFill.fillColor   = UIColor(hex: "#00ff88")
        heatBarFill.strokeColor = .clear
        heatBarFill.position    = CGPoint(x: barX + barWidth * 0.5, y: heatBarY + 1)
        heatBarFill.zPosition   = 22

        // Heat label
        heatLabel = SKLabelNode(text: "0°")
        heatLabel.fontName  = "AvenirNext-Bold"
        heatLabel.fontSize  = 12
        heatLabel.fontColor = GC.colorHUD
        heatLabel.position  = CGPoint(x: GC.hudLeftWidth * 0.5, y: heatBarY - 18)
        heatLabel.horizontalAlignmentMode = .center
        heatLabel.zPosition = 21

        // HEAT label above bar
        let heatTitle = SKLabelNode(text: "HEAT")
        heatTitle.fontName  = "AvenirNext-Bold"
        heatTitle.fontSize  = 11
        heatTitle.fontColor = GC.colorWallBorder
        heatTitle.position  = CGPoint(x: GC.hudLeftWidth * 0.5, y: heatBarY + heatBarH + 6)
        heatTitle.zPosition = 21

        // CRITICAL label (hidden until needed)
        critLabel = SKLabelNode(text: "CRITICAL")
        critLabel.fontName  = "AvenirNext-Bold"
        critLabel.fontSize  = 10
        critLabel.fontColor = GC.colorCritical
        critLabel.position  = CGPoint(x: GC.hudLeftWidth * 0.5, y: heatBarY + heatBarH + 20)
        critLabel.horizontalAlignmentMode = .center
        critLabel.zPosition = 22
        critLabel.alpha     = 0

        // Energy bar background
        energyBarBg = SKShapeNode(rectOf: CGSize(width: barWidth, height: energyBarH), cornerRadius: 4)
        energyBarBg.fillColor   = UIColor(white: 0.15, alpha: 1)
        energyBarBg.strokeColor = GC.colorEnergy.withAlphaComponent(0.5)
        energyBarBg.lineWidth   = 1
        energyBarBg.position    = CGPoint(x: barX + barWidth * 0.5, y: energyBarY + energyBarH * 0.5)
        energyBarBg.zPosition   = 21

        // Energy bar fill
        energyBarFill = SKShapeNode(rectOf: CGSize(width: barWidth - 4, height: 2), cornerRadius: 3)
        energyBarFill.fillColor   = GC.colorEnergy
        energyBarFill.strokeColor = .clear
        energyBarFill.position    = CGPoint(x: barX + barWidth * 0.5, y: energyBarY + 1)
        energyBarFill.zPosition   = 22

        let energyTitle = SKLabelNode(text: "ENERGY")
        energyTitle.fontName  = "AvenirNext-Bold"
        energyTitle.fontSize  = 11
        energyTitle.fontColor = GC.colorEnergy
        energyTitle.position  = CGPoint(x: GC.hudLeftWidth * 0.5, y: energyBarY + energyBarH + 6)
        energyTitle.zPosition = 21

        energyLabel = SKLabelNode(text: "0")
        energyLabel.fontName  = "AvenirNext-Bold"
        energyLabel.fontSize  = 12
        energyLabel.fontColor = GC.colorEnergy
        energyLabel.position  = CGPoint(x: GC.hudLeftWidth * 0.5, y: energyBarY - 18)
        energyLabel.horizontalAlignmentMode = .center
        energyLabel.zPosition = 21

        // Lives hearts
        for i in 0..<GC.playerLives {
            let heart = SKShapeNode(circleOfRadius: 9)
            heart.fillColor   = UIColor(hex: "#ff3344")
            heart.strokeColor = .white
            heart.lineWidth   = 1.5
            heart.position    = CGPoint(x: 18 + CGFloat(i) * 22, y: 130)
            heart.zPosition   = 21
            heartNodes.append(heart)
        }

        let livesTitle = SKLabelNode(text: "LIVES")
        livesTitle.fontName  = "AvenirNext-Bold"
        livesTitle.fontSize  = 11
        livesTitle.fontColor = GC.colorHUD
        livesTitle.position  = CGPoint(x: GC.hudLeftWidth * 0.5, y: 148)
        livesTitle.zPosition = 21

        // ---- RIGHT PANEL BACKGROUND ----
        let rightBg = SKShapeNode(rectOf: CGSize(width: GC.canvasWidth - GC.hudRightStart,
                                                  height: GC.canvasHeight))
        rightBg.fillColor   = UIColor(hex: "#050510").withAlphaComponent(0.92)
        rightBg.strokeColor = UIColor(hex: "#001133")
        rightBg.lineWidth   = 1
        rightBg.position    = CGPoint(x: GC.hudRightStart + (GC.canvasWidth - GC.hudRightStart) * 0.5,
                                       y: GC.canvasHeight * 0.5)
        rightBg.zPosition   = 20

        // Wave label
        waveLabel = SKLabelNode(text: "WAVE 1/8")
        waveLabel.fontName  = "AvenirNext-Bold"
        waveLabel.fontSize  = 14
        waveLabel.fontColor = GC.colorWallBorder
        waveLabel.position  = CGPoint(x: GC.hudRightStart + 47, y: GC.canvasHeight - 24)
        waveLabel.horizontalAlignmentMode = .center
        waveLabel.zPosition = 21

        // Wave progress dots
        for i in 0..<GC.maxWaves {
            let dot = SKShapeNode(circleOfRadius: 5)
            dot.fillColor   = UIColor(white: 0.3, alpha: 1)
            dot.strokeColor = GC.colorWallBorder.withAlphaComponent(0.4)
            dot.lineWidth   = 1
            dot.position    = CGPoint(x: GC.hudRightStart + 12 + CGFloat(i) * 10, y: GC.canvasHeight - 44)
            dot.zPosition   = 21
            dotNodes.append(dot)
        }

        // Score label
        let scoreTitle = SKLabelNode(text: "SCORE")
        scoreTitle.fontName  = "AvenirNext-Bold"
        scoreTitle.fontSize  = 11
        scoreTitle.fontColor = GC.colorHUD.withAlphaComponent(0.7)
        scoreTitle.position  = CGPoint(x: GC.hudRightStart + 47, y: GC.canvasHeight - 65)
        scoreTitle.horizontalAlignmentMode = .center
        scoreTitle.zPosition = 21

        scoreLabel = SKLabelNode(text: "0")
        scoreLabel.fontName  = "AvenirNext-Bold"
        scoreLabel.fontSize  = 20
        scoreLabel.fontColor = GC.colorCombo
        scoreLabel.position  = CGPoint(x: GC.hudRightStart + 47, y: GC.canvasHeight - 90)
        scoreLabel.horizontalAlignmentMode = .center
        scoreLabel.zPosition = 21

        // Bomb selector cards
        let cardW: CGFloat = 76
        let cardH: CGFloat = 60
        let cardStartY: CGFloat = 700
        for (i, btype) in BombType.allCases.enumerated() {
            let card = SKNode()
            let bg = SKShapeNode(rectOf: CGSize(width: cardW, height: cardH), cornerRadius: 6)
            bg.fillColor   = btype.color.withAlphaComponent(0.12)
            bg.strokeColor = btype.color.withAlphaComponent(0.5)
            bg.lineWidth   = 1.5
            bg.name = "cardBg"

            let nameLabel = SKLabelNode(text: btype.displayName)
            nameLabel.fontName  = "AvenirNext-Bold"
            nameLabel.fontSize  = 11
            nameLabel.fontColor = btype.color
            nameLabel.position  = CGPoint(x: 0, y: 10)
            nameLabel.horizontalAlignmentMode = .center

            let costLabel = SKLabelNode(text: btype.cost == 0 ? "FREE" : "\(Int(btype.cost))E")
            costLabel.fontName  = "AvenirNext-Bold"
            costLabel.fontSize  = 10
            costLabel.fontColor = GC.colorEnergy
            costLabel.position  = CGPoint(x: 0, y: -8)
            costLabel.horizontalAlignmentMode = .center

            let highlight = SKShapeNode(rectOf: CGSize(width: cardW + 4, height: cardH + 4), cornerRadius: 7)
            highlight.fillColor   = .clear
            highlight.strokeColor = btype.color
            highlight.lineWidth   = 3
            highlight.alpha       = 0
            bombHighlights.append(highlight)

            card.addChild(bg)
            card.addChild(nameLabel)
            card.addChild(costLabel)
            card.addChild(highlight)
            card.position = CGPoint(x: GC.hudRightStart + 47,
                                     y: cardStartY - CGFloat(i) * (cardH + 8))
            card.zPosition = 21
            bombCards.append(card)
        }

        // ---- BOTTOM BAR BACKGROUND ----
        let bottomBg = SKShapeNode(rectOf: CGSize(width: GC.canvasWidth, height: GC.canvasHeight - GC.hudBottomStart))
        bottomBg.fillColor   = UIColor(hex: "#050510").withAlphaComponent(0.92)
        bottomBg.strokeColor = UIColor(hex: "#001133")
        bottomBg.lineWidth   = 1
        bottomBg.position    = CGPoint(x: GC.canvasWidth * 0.5,
                                        y: GC.hudBottomStart + (GC.canvasHeight - GC.hudBottomStart) * 0.5)
        bottomBg.zPosition   = 20

        bombStatLabel = SKLabelNode(text: "BASIC  PWR:2  HEAT:+8  RNG:2  DLY:2.0s")
        bombStatLabel.fontName  = "AvenirNext-Bold"
        bombStatLabel.fontSize  = 12
        bombStatLabel.fontColor = GC.colorHUD
        bombStatLabel.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.hudBottomStart + 28)
        bombStatLabel.horizontalAlignmentMode = .center
        bombStatLabel.zPosition = 21

        hintLabel = SKLabelNode(text: "LEFT: MOVE   RIGHT: BOMB")
        hintLabel.fontName  = "AvenirNext-Bold"
        hintLabel.fontSize  = 11
        hintLabel.fontColor = GC.colorHUD.withAlphaComponent(0.5)
        hintLabel.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.hudBottomStart + 10)
        hintLabel.horizontalAlignmentMode = .center
        hintLabel.zPosition = 21

        // Add everything to root node
        node.addChild(leftBg)
        node.addChild(reactorLabel)
        node.addChild(heatBarBg)
        node.addChild(heatBarFill)
        node.addChild(heatLabel)
        node.addChild(heatTitle)
        node.addChild(critLabel)
        node.addChild(energyBarBg)
        node.addChild(energyBarFill)
        node.addChild(energyTitle)
        node.addChild(energyLabel)
        node.addChild(livesTitle)
        heartNodes.forEach { node.addChild($0) }

        node.addChild(rightBg)
        node.addChild(waveLabel)
        dotNodes.forEach { node.addChild($0) }
        node.addChild(scoreTitle)
        node.addChild(scoreLabel)
        bombCards.forEach { node.addChild($0) }

        node.addChild(bottomBg)
        node.addChild(bombStatLabel)
        node.addChild(hintLabel)

        node.zPosition = 20
    }

    // MARK: Update heat bar
    func updateHeat(_ fraction: CGFloat, value: CGFloat, isCritical: Bool) {
        let newH = max(2, fraction * heatBarH)
        let fillShape = heatBarFill
        // Resize by redrawing
        let newRect = CGRect(x: -(barWidth - 4) * 0.5,
                             y: 0,
                             width: barWidth - 4,
                             height: newH)
        fillShape.path = CGPath(roundedRect: newRect, cornerWidth: 3, cornerHeight: 3, transform: nil)
        fillShape.position = CGPoint(x: barX + barWidth * 0.5, y: heatBarY)

        // Colour gradient: green→orange→red
        let color: UIColor
        if fraction < 0.5 {
            color = UIColor(hex: "#00ff88")
        } else if fraction < 0.8 {
            color = UIColor(hex: "#ff8800")
        } else {
            color = UIColor(hex: "#ff2200")
        }
        fillShape.fillColor = color

        heatLabel.text = "\(Int(value))°"

        // Critical blink
        if isCritical {
            if critLabel.action(forKey: "blink") == nil {
                let blink = SKAction.sequence([
                    SKAction.fadeIn(withDuration: 0.3),
                    SKAction.fadeOut(withDuration: 0.3)
                ])
                critLabel.run(SKAction.repeatForever(blink), withKey: "blink")
            }
        } else {
            critLabel.removeAction(forKey: "blink")
            critLabel.alpha = 0
        }
    }

    // MARK: Update energy bar
    func updateEnergy(_ fraction: CGFloat, value: CGFloat) {
        let newH = max(2, fraction * energyBarH)
        let newRect = CGRect(x: -(barWidth - 4) * 0.5,
                             y: 0,
                             width: barWidth - 4,
                             height: newH)
        energyBarFill.path = CGPath(roundedRect: newRect, cornerWidth: 3, cornerHeight: 3, transform: nil)
        energyBarFill.position = CGPoint(x: barX + barWidth * 0.5, y: energyBarY)
        energyLabel.text = "\(Int(value))"
    }

    // MARK: Update lives
    func updateLives(_ lives: Int) {
        for (i, heart) in heartNodes.enumerated() {
            heart.fillColor = i < lives ? UIColor(hex: "#ff3344") : UIColor(white: 0.2, alpha: 1)
            heart.alpha     = i < lives ? 1.0 : 0.3
        }
    }

    // MARK: Update wave
    func updateWave(_ wave: Int) {
        waveLabel.text = "WAVE \(wave)/\(GC.maxWaves)"
        for (i, dot) in dotNodes.enumerated() {
            dot.fillColor = i < wave ? GC.colorWallBorder : UIColor(white: 0.25, alpha: 1)
        }
    }

    // MARK: Update score
    func updateScore(_ score: Int) {
        scoreLabel.text = "\(score)"
    }

    // MARK: Update selected bomb highlight
    func updateSelectedBomb(_ selected: BombType) {
        for (i, highlight) in bombHighlights.enumerated() {
            highlight.alpha = (i == selected.rawValue) ? 1.0 : 0.0
        }
        // Update bottom stat line
        let b = selected
        let heatStr = b.heat >= 0 ? "+\(Int(b.heat))" : "\(Int(b.heat))"
        bombStatLabel.text = "\(b.displayName)  PWR:\(b.power)  HEAT:\(heatStr)  RNG:\(b.range)  DLY:\(b.delay)s"
        bombStatLabel.fontColor = b.color
    }

    // MARK: Floating score text
    /// Returns a label node the caller should add to the scene.
    func floatingText(_ text: String, at pos: CGPoint, color: UIColor = GC.colorCombo) -> SKLabelNode {
        let label = SKLabelNode(text: text)
        label.fontName  = "AvenirNext-Bold"
        label.fontSize  = 22
        label.fontColor = color
        label.position  = pos
        label.zPosition = 30
        label.run(SKAction.sequence([
            SKAction.group([
                SKAction.move(by: CGVector(dx: 0, dy: 48), duration: 0.75),
                SKAction.sequence([
                    SKAction.wait(forDuration: 0.35),
                    SKAction.fadeOut(withDuration: 0.4)
                ])
            ]),
            SKAction.removeFromParent()
        ]))
        return label
    }

    // MARK: Overlay management
    func showOverlay(_ overlayNode: SKNode) {
        removeOverlay()
        self.overlayNode = overlayNode
        node.addChild(overlayNode)
    }

    func removeOverlay() {
        overlayNode?.removeFromParent()
        overlayNode = nil
    }

    // MARK: Title Screen Overlay
    func makeTitleOverlay() -> SKNode {
        let root = SKNode()
        root.zPosition = 50

        let bg = SKShapeNode(rectOf: CGSize(width: GC.canvasWidth, height: GC.canvasHeight))
        bg.fillColor   = UIColor(hex: "#050510").withAlphaComponent(0.96)
        bg.strokeColor = .clear
        bg.position    = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5)
        root.addChild(bg)

        let title = SKLabelNode(text: "REACTOR SIEGE")
        title.fontName  = "AvenirNext-Heavy"
        title.fontSize  = 52
        title.fontColor = GC.colorWallBorder
        title.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 80)
        title.horizontalAlignmentMode = .center
        let glow = SKAction.sequence([
            SKAction.fadeAlpha(to: 0.6, duration: 0.8),
            SKAction.fadeAlpha(to: 1.0, duration: 0.8)
        ])
        title.run(SKAction.repeatForever(glow))
        root.addChild(title)

        let sub = SKLabelNode(text: "Survive 8 waves. Guard the reactor.")
        sub.fontName  = "AvenirNext-Bold"
        sub.fontSize  = 18
        sub.fontColor = GC.colorHUD.withAlphaComponent(0.8)
        sub.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 28)
        sub.horizontalAlignmentMode = .center
        root.addChild(sub)

        let tap = SKLabelNode(text: "TAP TO START")
        tap.fontName  = "AvenirNext-Bold"
        tap.fontSize  = 24
        tap.fontColor = GC.colorCombo
        tap.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 - 60)
        tap.horizontalAlignmentMode = .center
        let tapBlink = SKAction.sequence([
            SKAction.fadeIn(withDuration: 0.5),
            SKAction.fadeOut(withDuration: 0.5)
        ])
        tap.run(SKAction.repeatForever(tapBlink))
        root.addChild(tap)

        return root
    }

    // MARK: Game Over Overlay
    func makeGameOverOverlay(score: Int) -> SKNode {
        let root = SKNode()
        root.zPosition = 50

        let bg = SKShapeNode(rectOf: CGSize(width: 460, height: 320), cornerRadius: 18)
        bg.fillColor   = UIColor(hex: "#0a0020").withAlphaComponent(0.97)
        bg.strokeColor = GC.colorCritical
        bg.lineWidth   = 3
        bg.position    = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5)
        root.addChild(bg)

        let over = SKLabelNode(text: "REACTOR BREACHED")
        over.fontName  = "AvenirNext-Heavy"
        over.fontSize  = 36
        over.fontColor = GC.colorCritical
        over.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 100)
        over.horizontalAlignmentMode = .center
        root.addChild(over)

        let sc = SKLabelNode(text: "SCORE: \(score)")
        sc.fontName  = "AvenirNext-Bold"
        sc.fontSize  = 26
        sc.fontColor = GC.colorCombo
        sc.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 30)
        sc.horizontalAlignmentMode = .center
        root.addChild(sc)

        let restart = SKLabelNode(text: "TAP TO RESTART")
        restart.fontName  = "AvenirNext-Bold"
        restart.fontSize  = 22
        restart.fontColor = GC.colorHUD
        restart.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 - 60)
        restart.horizontalAlignmentMode = .center
        let blink = SKAction.repeatForever(SKAction.sequence([
            SKAction.fadeIn(withDuration: 0.5), SKAction.fadeOut(withDuration: 0.5)
        ]))
        restart.run(blink)
        root.addChild(restart)

        return root
    }

    // MARK: Win Overlay
    func makeWinOverlay(score: Int) -> SKNode {
        let root = SKNode()
        root.zPosition = 50

        let bg = SKShapeNode(rectOf: CGSize(width: 460, height: 320), cornerRadius: 18)
        bg.fillColor   = UIColor(hex: "#000a20").withAlphaComponent(0.97)
        bg.strokeColor = GC.colorWallBorder
        bg.lineWidth   = 3
        bg.position    = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5)
        root.addChild(bg)

        let win = SKLabelNode(text: "REACTOR DEFENDED!")
        win.fontName  = "AvenirNext-Heavy"
        win.fontSize  = 34
        win.fontColor = GC.colorWallBorder
        win.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 100)
        win.horizontalAlignmentMode = .center
        let glow = SKAction.repeatForever(SKAction.sequence([
            SKAction.fadeAlpha(to: 0.6, duration: 0.5), SKAction.fadeAlpha(to: 1.0, duration: 0.5)
        ]))
        win.run(glow)
        root.addChild(win)

        let sc = SKLabelNode(text: "FINAL SCORE: \(score)")
        sc.fontName  = "AvenirNext-Bold"
        sc.fontSize  = 26
        sc.fontColor = GC.colorCombo
        sc.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 30)
        sc.horizontalAlignmentMode = .center
        root.addChild(sc)

        let restart = SKLabelNode(text: "TAP TO PLAY AGAIN")
        restart.fontName  = "AvenirNext-Bold"
        restart.fontSize  = 22
        restart.fontColor = GC.colorHUD
        restart.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 - 60)
        restart.horizontalAlignmentMode = .center
        restart.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.fadeIn(withDuration: 0.5), SKAction.fadeOut(withDuration: 0.5)
        ])))
        root.addChild(restart)

        return root
    }

    // MARK: Upgrade Overlay
    func makeUpgradeOverlay(upgrades: [UpgradeType]) -> SKNode {
        let root = SKNode()
        root.zPosition = 50

        let dimBg = SKShapeNode(rectOf: CGSize(width: GC.canvasWidth, height: GC.canvasHeight))
        dimBg.fillColor   = UIColor.black.withAlphaComponent(0.75)
        dimBg.strokeColor = .clear
        dimBg.position    = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5)
        root.addChild(dimBg)

        let title = SKLabelNode(text: "UPGRADE AVAILABLE")
        title.fontName  = "AvenirNext-Heavy"
        title.fontSize  = 28
        title.fontColor = GC.colorCombo
        title.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 200)
        title.horizontalAlignmentMode = .center
        root.addChild(title)

        let sub = SKLabelNode(text: "Choose one upgrade (tap left / center / right)")
        sub.fontName  = "AvenirNext-Bold"
        sub.fontSize  = 14
        sub.fontColor = GC.colorHUD.withAlphaComponent(0.7)
        sub.position  = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 165)
        sub.horizontalAlignmentMode = .center
        root.addChild(sub)

        let cardW: CGFloat = 200
        let cardH: CGFloat = 280
        let spacing: CGFloat = 220
        let totalW = CGFloat(upgrades.count - 1) * spacing
        let startX = GC.canvasWidth * 0.5 - totalW * 0.5

        for (i, upgrade) in upgrades.enumerated() {
            let cx = startX + CGFloat(i) * spacing
            let cy = GC.canvasHeight * 0.5

            let card = SKShapeNode(rectOf: CGSize(width: cardW, height: cardH), cornerRadius: 14)
            card.fillColor   = upgrade.color.withAlphaComponent(0.12)
            card.strokeColor = upgrade.color
            card.lineWidth   = 3
            card.position    = CGPoint(x: cx, y: cy)
            card.name        = "upgradeCard_\(i)"
            root.addChild(card)

            // Number badge
            let num = SKLabelNode(text: "\(i+1)")
            num.fontName  = "AvenirNext-Heavy"
            num.fontSize  = 40
            num.fontColor = upgrade.color
            num.position  = CGPoint(x: cx, y: cy + 80)
            num.horizontalAlignmentMode = .center
            root.addChild(num)

            let name = SKLabelNode(text: upgrade.displayName)
            name.fontName  = "AvenirNext-Bold"
            name.fontSize  = 18
            name.fontColor = upgrade.color
            name.position  = CGPoint(x: cx, y: cy + 20)
            name.horizontalAlignmentMode = .center
            root.addChild(name)

            let desc = SKLabelNode(text: upgrade.description)
            desc.fontName  = "AvenirNext-Bold"
            desc.fontSize  = 13
            desc.fontColor = GC.colorHUD
            desc.position  = CGPoint(x: cx, y: cy - 20)
            desc.horizontalAlignmentMode = .center
            root.addChild(desc)
        }

        return root
    }

    // MARK: Combo break label
    func showComboBreak(at pos: CGPoint) -> SKLabelNode {
        let label = SKLabelNode(text: "COMBO BREAK!")
        label.fontName  = "AvenirNext-Heavy"
        label.fontSize  = 28
        label.fontColor = GC.colorCritical
        label.position  = pos
        label.zPosition = 30
        label.run(SKAction.sequence([
            SKAction.wait(forDuration: 0.8),
            SKAction.fadeOut(withDuration: 0.2),
            SKAction.removeFromParent()
        ]))
        return label
    }
}
