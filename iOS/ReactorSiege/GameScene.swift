// /Users/mamospower/chain-reactors/iOS/ReactorSiege/GameScene.swift
// Reactor Siege — Main SpriteKit scene: input, game loop, all systems wired together

import SpriteKit
import UIKit

// MARK: - GameScene
class GameScene: SKScene {

    // MARK: - Sub-systems
    private let state   = GameState()
    private let reactor = Reactor()
    private let grid    = Grid()
    private let hud     = HUD()
    private var player  = Player()

    // MARK: - Entity collections
    private var enemies: [Enemy] = []
    private var bombs:   [Bomb]  = []

    // MARK: - Visual layers
    private let worldLayer  = SKNode()   // grid tiles
    private let entityLayer = SKNode()   // player + enemies + bombs
    private let fxLayer     = SKNode()   // explosions, particles
    private let hudLayer    = SKNode()   // HUD (above everything)

    // MARK: - Grid tile nodes (indexed [col][row])
    private var tileNodes: [[SKShapeNode]] = []

    // MARK: - Joystick state
    private var joystickTouchID:   UITouch? = nil
    private var joystickBase:      SKShapeNode?
    private var joystickKnob:      SKShapeNode?
    private var joystickOrigin:    CGPoint = .zero
    private var joystickDirection: (col: Int, row: Int) = (0, 0)

    // MARK: - Timing
    private var lastUpdateTime: TimeInterval = 0
    private var upgradeTimer: TimeInterval   = 0   // countdown to next timed upgrade offer

    // MARK: - Scene setup
    override func didMove(to view: SKView) {
        backgroundColor = GC.colorBackground

        addChild(worldLayer)
        addChild(entityLayer)
        addChild(fxLayer)
        addChild(hudLayer)

        worldLayer.zPosition  = 0
        entityLayer.zPosition = 3
        fxLayer.zPosition     = 8
        hudLayer.zPosition    = 20

        hudLayer.addChild(hud.node)

        AudioManager.shared.setupAudio()
        AudioManager.shared.playHomeMusic()

        buildTileGrid()
        setupJoystickNodes()

        // Show title screen
        state.phase = .start
        hud.showOverlay(hud.makeTitleOverlay())
    }

    // MARK: - Tile grid construction
    private func buildTileGrid() {
        // Remove old nodes
        worldLayer.removeAllChildren()
        tileNodes = []

        // Build subtle background
        let bgRect = SKShapeNode(rectOf: CGSize(width: GC.canvasWidth, height: GC.canvasHeight))
        bgRect.fillColor   = GC.colorBackground
        bgRect.strokeColor = .clear
        bgRect.position    = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5)
        worldLayer.addChild(bgRect)

        for col in 0..<GC.cols {
            var colArr: [SKShapeNode] = []
            for row in 0..<GC.rows {
                let node = makeTileNode(col: col, row: row)
                worldLayer.addChild(node)
                colArr.append(node)
            }
            tileNodes.append(colArr)
        }
    }

    private func makeTileNode(col: Int, row: Int) -> SKShapeNode {
        let s = GC.tileSize - 2
        let node = SKShapeNode(rectOf: CGSize(width: s, height: s), cornerRadius: 3)
        node.position = tileScenePos(col: col, row: row)
        node.zPosition = 1
        applyTileStyle(node: node, type: grid.cells[col][row].type)
        return node
    }

    private func applyTileStyle(node: SKShapeNode, type: Int) {
        switch type {
        case GC.WALL:
            node.fillColor   = GC.colorWall
            node.strokeColor = GC.colorWallBorder.withAlphaComponent(0.8)
            node.lineWidth   = 1.5
        case GC.SOFT:
            node.fillColor   = GC.colorSoft
            node.strokeColor = GC.colorSoftDetail.withAlphaComponent(0.6)
            node.lineWidth   = 1.5
            // X detail drawn as two sub-lines
            addSoftXDetail(to: node)
        default: // FLOOR
            node.fillColor   = GC.colorFloor
            node.strokeColor = UIColor(white: 0.15, alpha: 0.4)
            node.lineWidth   = 0.5
        }
    }

    private func addSoftXDetail(to parent: SKShapeNode) {
        // Two diagonal lines forming an X
        let s: CGFloat = (GC.tileSize - 2) * 0.38
        for flip in [CGFloat(1), CGFloat(-1)] {
            let path = CGMutablePath()
            path.move(to: CGPoint(x: -s, y: -s * flip))
            path.addLine(to: CGPoint(x:  s, y:  s * flip))
            let line = SKShapeNode(path: path)
            line.strokeColor = GC.colorSoftDetail.withAlphaComponent(0.5)
            line.lineWidth   = 1.5
            line.zPosition   = 2
            parent.addChild(line)
        }
    }

    private func tileScenePos(col: Int, row: Int) -> CGPoint {
        let x = GC.gridOffsetX + CGFloat(col) * GC.tileSize + GC.tileSize * 0.5
        let y = GC.gridOffsetY + CGFloat(row) * GC.tileSize + GC.tileSize * 0.5
        return CGPoint(x: x, y: y)
    }

    private func refreshTile(col: Int, row: Int) {
        guard col < tileNodes.count, row < tileNodes[col].count else { return }
        let node = tileNodes[col][row]
        node.removeAllChildren()
        applyTileStyle(node: node, type: grid.cells[col][row].type)
    }

    // MARK: - Joystick node setup
    private func setupJoystickNodes() {
        let base = SKShapeNode(circleOfRadius: GC.joystickRadius)
        base.fillColor   = UIColor(white: 0.9, alpha: 0.12)
        base.strokeColor = UIColor(white: 1.0, alpha: 0.35)
        base.lineWidth   = 2
        base.zPosition   = 25
        base.alpha       = 0
        hudLayer.addChild(base)
        joystickBase = base

        let knob = SKShapeNode(circleOfRadius: GC.joystickRadius * 0.40)
        knob.fillColor   = UIColor(white: 1.0, alpha: 0.5)
        knob.strokeColor = .white
        knob.lineWidth   = 2
        knob.zPosition   = 26
        knob.alpha       = 0
        hudLayer.addChild(knob)
        joystickKnob = knob
    }

    // MARK: - Start game
    private func startGame() {
        state.reset()
        reactor.reset()
        grid.reset()
        player = Player()

        enemies.removeAll()
        bombs.removeAll()
        entityLayer.removeAllChildren()
        fxLayer.removeAllChildren()

        buildTileGrid()

        entityLayer.addChild(player.node)
        player.reset()

        state.phase = .playing
        state.wave  = 1
        upgradeTimer = 30

        spawnWave(state.wave)
        hud.removeOverlay()
        hud.updateWave(state.wave)
        hud.updateLives(state.lives)
        hud.updateScore(0)
        hud.updateSelectedBomb(state.selectedBomb)

        AudioManager.shared.playGameMusic()
    }

    // MARK: - Wave spawning
    private func spawnWave(_ w: Int) {
        let comp  = state.composition(for: w)
        let speed = comp.speedMult
        let corners = GC.cornerSpawns

        // Spread enemies across corners
        var enemyList: [EnemyType] = []
        for _ in 0..<comp.chasers   { enemyList.append(.chaser) }
        for _ in 0..<comp.saboteurs { enemyList.append(.saboteur) }
        for _ in 0..<comp.cowards   { enemyList.append(.coward) }
        enemyList.shuffle()

        for (i, etype) in enemyList.enumerated() {
            let corner = corners[i % corners.count]
            // Find nearest floor tile near corner
            let spawnPos = nearestFloor(col: corner.col, row: corner.row)
            let enemy = Enemy(type: etype, col: spawnPos.col, row: spawnPos.row, speedMult: speed)
            enemies.append(enemy)
            entityLayer.addChild(enemy.node)
        }
    }

    private func nearestFloor(col: Int, row: Int) -> (col: Int, row: Int) {
        if grid.isPassable(col: col, row: row) { return (col, row) }
        let dirs = [(0,1),(0,-1),(1,0),(-1,0),(1,1),(1,-1),(-1,1),(-1,-1)]
        for (dc, dr) in dirs {
            let nc = col + dc; let nr = row + dr
            if grid.isPassable(col: nc, row: nr) { return (nc, nr) }
        }
        return (col, row)
    }

    // MARK: - Main update loop
    override func update(_ currentTime: TimeInterval) {
        guard state.phase == .playing else { return }

        // Clamp dt to avoid giant jumps; treat first frame as 16 ms
        let dt: TimeInterval
        if lastUpdateTime == 0 {
            dt = 0.016
        } else {
            dt = min(currentTime - lastUpdateTime, 0.1)
        }
        lastUpdateTime = currentTime

        // ----- Reactor -----
        let meltdown = reactor.update(dt: dt, state: state)
        if meltdown { handleMeltdown() }

        hud.updateHeat(reactor.heatFraction, value: reactor.heat, isCritical: reactor.isCritical)
        hud.updateEnergy(reactor.energyFraction, value: reactor.energy)

        // ----- Player -----
        player.update(dt: dt)
        handlePlayerMovement()
        checkPlayerEnemyCollisions()

        // ----- Bombs -----
        tickBombs(dt: dt, currentTime: currentTime)

        // ----- Enemies -----
        tickEnemies(dt: dt)

        // ----- Combo -----
        let comboBroke = state.tickCombo(dt: dt)
        if comboBroke {
            let midX = GC.canvasWidth  * 0.5
            let midY = GC.canvasHeight * 0.5 + 120
            let lbl = hud.showComboBreak(at: CGPoint(x: midX, y: midY))
            hudLayer.addChild(lbl)
        }

        // ----- Timed upgrade -----
        upgradeTimer -= dt
        if upgradeTimer <= 0 {
            upgradeTimer = 30
            showUpgradeScreen()
            return
        }

        // ----- Wave clear check -----
        if enemies.isEmpty && state.phase == .playing {
            waveCleared()
        }
    }

    // MARK: - Movement
    private func handlePlayerMovement() {
        guard player.moveCooldownTimer <= 0 else { return }
        let (dc, dr) = joystickDirection
        guard dc != 0 || dr != 0 else { return }

        let nc = player.col + dc
        let nr = player.row + dr
        if grid.isPassable(col: nc, row: nr) {
            // Check bomb occupancy
            let bombOnTarget = bombs.contains { $0.col == nc && $0.row == nr }
            if !bombOnTarget {
                player.moveTo(col: nc, row: nr)
            }
        }
    }

    // MARK: - Bomb ticking
    private func tickBombs(dt: TimeInterval, currentTime: TimeInterval) {
        var toDetonate: [Bomb] = []
        for bomb in bombs {
            if bomb.update(dt: dt) {
                toDetonate.append(bomb)
            }
        }
        for bomb in toDetonate {
            detonateBomb(bomb)
        }
    }

    // MARK: - Bomb placement
    private func placeBomb(at col: Int, row: Int) {
        guard state.phase == .playing else { return }
        guard bombs.count < state.maxBombs else { return }

        // Check if bomb already on this tile
        guard !bombs.contains(where: { $0.col == col && $0.row == row }) else { return }

        let btype = state.selectedBomb
        guard reactor.consumeEnergy(for: btype) else {
            // Flash energy bar to indicate insufficient energy
            flashEnergyInsufficient()
            return
        }

        let delay = btype.delay
        let bomb  = Bomb(type: btype, col: col, row: row, delay: delay)
        bombs.append(bomb)
        entityLayer.addChild(bomb.node)
    }

    private func flashEnergyInsufficient() {
        // Show floating "NO ENERGY" text on the HUD
        let lbl = hud.floatingText("NO ENERGY",
                                   at: CGPoint(x: GC.hudLeftWidth * 0.5 + 20, y: 300),
                                   color: .red)
        hudLayer.addChild(lbl)
    }

    // MARK: - Detonation
    private func detonateBomb(_ bomb: Bomb) {
        guard bomb.isArmed == false else { return }   // already disarmed (just triggered)
        bombs.removeAll { $0.id == bomb.id }
        bomb.remove()

        let range  = state.effectiveRange(for: bomb.type)
        let blasts = grid.blastCells(col: bomb.col, row: bomb.row, range: range)

        // Apply reactor heat
        reactor.applyHeat(state.effectiveHeat(for: bomb.type))

        // Gain energy from explosion
        let energyGain = CGFloat(state.effectivePower(for: bomb.type)) * GC.energyPerExplosionPower
        reactor.addEnergy(energyGain)

        // Collect enemies and bombs in blast
        var chainBombs: [Bomb] = []
        var hitEnemyIDs: [UUID] = []

        for blast in blasts {
            let worldPos = tileScenePos(col: blast.col, row: blast.row)

            // Visual flash
            let flash = Bomb.explosionFlash(at: worldPos, color: bomb.type.color)
            fxLayer.addChild(flash)

            // Destroy soft block
            if blast.destroysSoft {
                if grid.damageCell(col: blast.col, row: blast.row) {
                    refreshTile(col: blast.col, row: blast.row)
                }
            }

            // Hit player
            if blast.col == player.col && blast.row == player.row {
                hitPlayer()
            }

            // Check enemies
            for enemy in enemies where enemy.col == blast.col && enemy.row == blast.row {
                if bomb.type == .cryo {
                    enemy.freeze(duration: GC.cryoFreezeDuration)
                } else {
                    hitEnemyIDs.append(enemy.id)
                }
            }

            // CHAIN: find other armed bombs in blast
            if bomb.type == .chain {
                for other in bombs where other.col == blast.col && other.row == blast.row && other.isArmed {
                    chainBombs.append(other)
                }
            }
        }

        // Process enemy kills
        var killCount = 0
        for eid in hitEnemyIDs {
            if let idx = enemies.firstIndex(where: { $0.id == eid }) {
                let e = enemies[idx]
                if e.takeDamage(state.effectivePower(for: bomb.type)) {
                    // Dead
                    for particle in e.deathParticles() { fxLayer.addChild(particle) }
                    e.remove()
                    enemies.remove(at: idx)
                    let pts = state.registerKill(at: CACurrentMediaTime())
                    killCount += 1
                    hud.updateScore(state.score)

                    // Floating score
                    let pos = tileScenePos(col: e.col, row: e.row)
                    let lbl = hud.floatingText("+\(pts) ×\(state.combo)", at: pos)
                    entityLayer.addChild(lbl)
                }
            }
        }

        // Play explosion SFX regardless of kill count
        AudioManager.shared.playExplosion()

        // Chain reaction (after current blast processed)
        for chainBomb in chainBombs {
            chainBomb.forceDetonate()
            detonateBomb(chainBomb)
        }
    }

    // MARK: - Hit player
    private func hitPlayer() {
        guard !player.isInvincible else { return }
        player.hit()
        state.lives -= 1
        hud.updateLives(state.lives)

        // Screen flash
        showMeltdownFlash(color: UIColor.red.withAlphaComponent(0.35))

        if state.lives <= 0 {
            gameOver()
        }
    }

    // MARK: - Enemy collision with player
    private func checkPlayerEnemyCollisions() {
        guard !player.isInvincible else { return }
        for enemy in enemies where enemy.col == player.col && enemy.row == player.row {
            hitPlayer()
            break
        }
    }

    // MARK: - Enemy AI ticks
    private func tickEnemies(dt: TimeInterval) {
        for enemy in enemies {
            guard enemy.update(dt: dt) else { continue }

            switch enemy.type {
            case .chaser:
                aiChaser(enemy)
            case .saboteur:
                aiSaboteur(enemy)
            case .coward:
                aiCoward(enemy)
            }

            // Apply coward heat
            reactor.applyHeat(enemy.type.heatPerMove)
        }
    }

    // CHASER: BFS toward player
    private func aiChaser(_ enemy: Enemy) {
        let target = (col: player.col, row: player.row)
        if let next = grid.bfsNextStep(from: (enemy.col, enemy.row), to: target) {
            if !enemyOccupied(col: next.col, row: next.row, excluding: enemy) {
                enemy.moveTo(col: next.col, row: next.row)
            }
        }
    }

    // SABOTEUR: BFS toward nearest bomb, else player; defuses bomb on same tile
    private func aiSaboteur(_ enemy: Enemy) {
        // Defuse any bomb on same tile
        if let idx = bombs.firstIndex(where: { $0.col == enemy.col && $0.row == enemy.row }) {
            let defused = bombs[idx]
            defused.remove()
            bombs.remove(at: idx)
            let lbl = hud.floatingText("DEFUSED!", at: tileScenePos(col: enemy.col, row: enemy.row),
                                       color: GC.colorSaboteur)
            fxLayer.addChild(lbl)
            return
        }

        // Move toward nearest bomb or player
        if !bombs.isEmpty {
            let bombPositions = bombs.map { (col: $0.col, row: $0.row) }
            if let next = grid.bfsNearestTarget(from: (enemy.col, enemy.row), targets: bombPositions) {
                if !enemyOccupied(col: next.col, row: next.row, excluding: enemy) {
                    enemy.moveTo(col: next.col, row: next.row)
                }
                return
            }
        }
        aiChaser(enemy)
    }

    // COWARD: maximize distance from bombs + 0.5× distance from player
    private func aiCoward(_ enemy: Enemy) {
        let dirs = [(0,1),(0,-1),(1,0),(-1,0)]
        var bestScore: CGFloat = -1e9
        var bestPos: (col: Int, row: Int)? = nil

        for (dc, dr) in dirs {
            let nc = enemy.col + dc
            let nr = enemy.row + dr
            guard grid.isPassable(col: nc, row: nr) else { continue }
            guard !enemyOccupied(col: nc, row: nr, excluding: enemy) else { continue }

            var score: CGFloat = 0
            // Distance from all bombs
            for bomb in bombs {
                let dx = CGFloat(nc - bomb.col)
                let dy = CGFloat(nr - bomb.row)
                score += sqrt(dx*dx + dy*dy)
            }
            // 0.5× distance from player
            let pdx = CGFloat(nc - player.col)
            let pdy = CGFloat(nr - player.row)
            score += 0.5 * sqrt(pdx*pdx + pdy*pdy)

            if score > bestScore {
                bestScore = score
                bestPos   = (nc, nr)
            }
        }

        if let pos = bestPos {
            enemy.moveTo(col: pos.col, row: pos.row)
        }
    }

    private func enemyOccupied(col: Int, row: Int, excluding self_: Enemy) -> Bool {
        return enemies.contains { $0.id != self_.id && $0.col == col && $0.row == row }
    }

    // MARK: - Meltdown
    private func handleMeltdown() {
        if state.reactorShield > 0 {
            state.reactorShield -= 1
            reactor.resetAfterMeltdown()
            let lbl = hud.floatingText("SHIELD ABSORBED MELTDOWN",
                                        at: CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 80),
                                        color: UIColor(hex: "#88ff88"))
            hudLayer.addChild(lbl)
        } else {
            // Destroy 40% random soft blocks
            let softs = grid.allSoftPositions().shuffled()
            let count = Int(ceil(CGFloat(softs.count) * GC.meltdownSoftDestroyPct))
            for i in 0..<min(count, softs.count) {
                let p = softs[i]
                grid.clearCell(col: p.col, row: p.row)
                refreshTile(col: p.col, row: p.row)
            }
            // Hit player
            hitPlayer()
            reactor.resetAfterMeltdown()
            showMeltdownFlash(color: UIColor.orange.withAlphaComponent(0.5))
            let lbl = hud.floatingText("MELTDOWN!",
                                        at: CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 80),
                                        color: GC.colorCritical)
            hudLayer.addChild(lbl)
        }
    }

    private func showMeltdownFlash(color: UIColor) {
        let flash = SKShapeNode(rectOf: CGSize(width: GC.canvasWidth, height: GC.canvasHeight))
        flash.fillColor   = color
        flash.strokeColor = .clear
        flash.position    = CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5)
        flash.zPosition   = 40
        flash.alpha       = 1
        addChild(flash)
        flash.run(SKAction.sequence([
            SKAction.fadeOut(withDuration: 0.4),
            SKAction.removeFromParent()
        ]))
    }

    // MARK: - Wave cleared
    private func waveCleared() {
        state.score += GC.waveClearBonus * state.wave
        hud.updateScore(state.score)

        let lbl = hud.floatingText("WAVE \(state.wave) CLEAR! +\(GC.waveClearBonus * state.wave)",
                                    at: CGPoint(x: GC.canvasWidth * 0.5, y: GC.canvasHeight * 0.5 + 50),
                                    color: GC.colorWallBorder)
        hudLayer.addChild(lbl)

        if state.wave >= GC.maxWaves {
            // Win!
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
                self?.triggerWin()
            }
            return
        }

        // Show upgrade screen after wave
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.showUpgradeScreen()
        }
    }

    // MARK: - Upgrade screen
    private func showUpgradeScreen() {
        guard state.phase == .playing else { return }
        state.phase = .upgrade
        state.rollUpgrades()
        let overlay = hud.makeUpgradeOverlay(upgrades: state.pendingUpgrades)
        overlay.name = "upgradeOverlay"
        hud.showOverlay(overlay)
        AudioManager.shared.playArcade()
    }

    private func applyUpgradeChoice(_ index: Int) {
        guard index < state.pendingUpgrades.count else { return }
        let upgrade = state.pendingUpgrades[index]
        state.applyUpgrade(upgrade, reactor: reactor)
        hud.removeOverlay()

        // Advance wave if enemies are gone (post-wave upgrade)
        if enemies.isEmpty {
            state.wave += 1
            hud.updateWave(state.wave)
            grid.softBlockBaseHP = 1 + state.softBlockHPBonus
            spawnWave(state.wave)
        }

        state.phase = .playing
        upgradeTimer = 30
    }

    // MARK: - Game Over
    private func gameOver() {
        state.phase = .gameover
        AudioManager.shared.stopMusic()
        let overlay = hud.makeGameOverOverlay(score: state.score)
        hud.showOverlay(overlay)
    }

    // MARK: - Win
    private func triggerWin() {
        state.phase = .win
        AudioManager.shared.stopMusic()
        AudioManager.shared.playArcade()
        let overlay = hud.makeWinOverlay(score: state.score)
        hud.showOverlay(overlay)
    }

    // MARK: - Touch Handling
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let scenePos = touch.location(in: self)

            switch state.phase {
            case .start:
                startGame()
                return

            case .gameover, .win:
                startGame()
                return

            case .upgrade:
                handleUpgradeTap(at: scenePos)
                return

            case .playing:
                handlePlayTap(touch: touch, at: scenePos)

            default:
                break
            }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard state.phase == .playing else { return }
        for touch in touches {
            if touch === joystickTouchID {
                let pos = touch.location(in: self)
                updateJoystick(pos: pos)
            }
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            if touch === joystickTouchID {
                endJoystick()
            }
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        touchesEnded(touches, with: event)
    }

    // MARK: Play touch routing
    private func handlePlayTap(touch: UITouch, at pos: CGPoint) {
        // LEFT half → joystick
        if pos.x < GC.canvasWidth * 0.5 {
            if joystickTouchID == nil {
                joystickTouchID = touch
                joystickOrigin  = pos
                joystickBase?.position = pos
                joystickKnob?.position = pos
                joystickBase?.alpha    = 1
                joystickKnob?.alpha    = 1
            }
        } else {
            // RIGHT half — check if a bomb-selector card was tapped first
            let inRightPanel = pos.x >= GC.hudRightStart
            if inRightPanel {
                trySelectBombCard(at: pos)
            } else {
                // Mid-right grid area → place bomb at player's current position
                placeBomb(at: player.col, row: player.row)
            }
        }
    }

    // MARK: Joystick update
    private func updateJoystick(pos: CGPoint) {
        let dx = pos.x - joystickOrigin.x
        let dy = pos.y - joystickOrigin.y
        let dist = sqrt(dx*dx + dy*dy)
        let clampedDist = min(dist, GC.joystickRadius)
        let angle = atan2(dy, dx)

        let kx = joystickOrigin.x + cos(angle) * clampedDist
        let ky = joystickOrigin.y + sin(angle) * clampedDist
        joystickKnob?.position = CGPoint(x: kx, y: ky)

        let deadZoneAbs = GC.joystickRadius * GC.joystickDeadZone
        if dist < deadZoneAbs {
            joystickDirection = (0, 0)
            return
        }

        let absDX = abs(dx); let absDY = abs(dy)
        if absDX > absDY {
            joystickDirection = (dx > 0 ? 1 : -1, 0)
        } else {
            joystickDirection = (0, dy > 0 ? 1 : -1)
        }
    }

    private func endJoystick() {
        joystickTouchID   = nil
        joystickDirection = (0, 0)
        joystickBase?.alpha = 0
        joystickKnob?.alpha = 0
    }

    // MARK: Upgrade tap
    private func handleUpgradeTap(at pos: CGPoint) {
        // Divide screen into thirds
        let third = GC.canvasWidth / 3.0
        if pos.x < third {
            applyUpgradeChoice(0)
        } else if pos.x < third * 2 {
            applyUpgradeChoice(1)
        } else {
            applyUpgradeChoice(2)
        }
    }

    // MARK: - Bomb selector via right-panel tap
    /// Detects if a bomb card was tapped and switches selection.
    private func trySelectBombCard(at pos: CGPoint) {
        guard pos.x >= GC.hudRightStart else { return }
        let cardH: CGFloat    = 60
        let cardStartY: CGFloat = 700
        for (i, _) in BombType.allCases.enumerated() {
            let cardY = cardStartY - CGFloat(i) * (cardH + 8)
            if abs(pos.y - cardY) < cardH * 0.5 {
                if let btype = BombType(rawValue: i) {
                    state.selectedBomb = btype
                    hud.updateSelectedBomb(btype)
                }
                return
            }
        }
    }
}
