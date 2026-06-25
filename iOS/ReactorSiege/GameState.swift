// /Users/mamospower/chain-reactors/iOS/ReactorSiege/GameState.swift
// Reactor Siege — Mutable game state (upgrades, score, wave, combo, etc.)

import Foundation

// MARK: - GameState
/// All mutable session data lives here so GameScene can reference a single source of truth.
class GameState {

    // MARK: Core progress
    var phase: GamePhase = .start
    var wave: Int  = 1
    var score: Int = 0

    // MARK: Player stats
    var lives: Int = GC.playerLives
    var maxBombs: Int = GC.defaultMaxBombs
    var selectedBomb: BombType = .basic

    // MARK: Upgrade-derived bonuses
    var coolingRateBonus: CGFloat = 0        // added to reactor.coolingRate
    var chainRangeBonus: Int      = 0        // added to chain bomb range
    var softBlockHPBonus: Int     = 0        // added to soft block HP
    var heatSinkBonus: CGFloat    = 0        // subtracted from heat applied
    var nukeBonus: Int            = 0        // added to nuke power/range bonus
    var reactorShield: Int        = 0        // absorbs meltdowns

    // MARK: Combo system
    var combo: Int                 = 0
    var comboTimer: TimeInterval   = 0       // counts down; reset on kill
    var lastKillTime: TimeInterval = 0

    // MARK: Upgrade schedule
    var nextUpgradeTime: TimeInterval = 30   // offer upgrade every 30 s in play
    var pendingUpgrades: [UpgradeType] = []  // 3 chosen at random

    // MARK: Computed effective bomb attributes
    /// Returns the effective range for a bomb type, including upgrade bonuses.
    func effectiveRange(for type: BombType) -> Int {
        var r = type.range
        if type == .chain { r += chainRangeBonus }
        if type == .nuke  { r += nukeBonus }
        return r
    }

    /// Returns the effective power for a bomb type.
    func effectivePower(for type: BombType) -> Int {
        var p = type.power
        if type == .nuke { p += nukeBonus }
        return p
    }

    /// Returns the effective heat delta for a bomb, applying heatsink reduction.
    func effectiveHeat(for type: BombType) -> CGFloat {
        let h = type.heat
        // Only reduce positive heat; cryo stays negative
        if h > 0 { return max(0, h - heatSinkBonus) }
        return h
    }

    // MARK: Combo helpers
    /// Call when a kill is registered. Returns the score awarded.
    func registerKill(at time: TimeInterval) -> Int {
        if combo < GC.maxCombo { combo += 1 }
        comboTimer = GC.comboTimerDuration
        lastKillTime = time
        let pts = Int(floor(Double(GC.baseKillScore) * (1.0 + Double(combo - 1) * 0.5)))
        score += pts
        return pts
    }

    /// Tick the combo timer. Returns true if combo just broke (was ≥ 2 before expiry).
    func tickCombo(dt: TimeInterval) -> Bool {
        guard combo > 0 && comboTimer > 0 else { return false }
        comboTimer -= dt
        if comboTimer <= 0 {
            let broke = combo >= 2
            combo = 0
            comboTimer = 0
            return broke
        }
        return false
    }

    // MARK: Wave composition
    struct WaveComposition {
        var chasers:   Int
        var saboteurs: Int
        var cowards:   Int
        var speedMult: Double
    }

    func composition(for w: Int) -> WaveComposition {
        let speed = 1.0 + Double(w - 1) * 0.08
        switch w {
        case 1: return WaveComposition(chasers: 4, saboteurs: 0, cowards: 0, speedMult: speed)
        case 2: return WaveComposition(chasers: 3, saboteurs: 2, cowards: 0, speedMult: speed)
        case 3: return WaveComposition(chasers: 3, saboteurs: 2, cowards: 2, speedMult: speed)
        default:
            let extra = w - 3
            let c = 3 + Int(floor(Double(extra) * 1.5))
            let s = 2 + extra
            let co = 2 + extra
            return WaveComposition(chasers: c, saboteurs: s, cowards: co, speedMult: speed)
        }
    }

    // MARK: Upgrade selection
    /// Pick 3 random unique upgrades for the upgrade screen.
    func rollUpgrades() {
        let all = UpgradeType.allCases.shuffled()
        pendingUpgrades = Array(all.prefix(3))
    }

    /// Apply the chosen upgrade to this state (and optionally to reactor energy).
    func applyUpgrade(_ upgrade: UpgradeType, reactor: Reactor) {
        switch upgrade {
        case .cooling:    coolingRateBonus += 2
        case .chainAmp:   chainRangeBonus  += 1
        case .energy:     reactor.energy = min(reactor.energy + 40, GC.reactorMaxEnergy)
        case .plating:    softBlockHPBonus += 1
        case .slot:       maxBombs += 1
        case .shield:     reactorShield += 1
        case .heatsink:   heatSinkBonus += 3
        case .overcharge: nukeBonus += 2
        }
    }

    // MARK: Reset
    func reset() {
        phase           = .start
        wave            = 1
        score           = 0
        lives           = GC.playerLives
        maxBombs        = GC.defaultMaxBombs
        selectedBomb    = .basic
        coolingRateBonus = 0
        chainRangeBonus  = 0
        softBlockHPBonus = 0
        heatSinkBonus    = 0
        nukeBonus        = 0
        reactorShield    = 0
        combo            = 0
        comboTimer       = 0
        lastKillTime     = 0
        nextUpgradeTime  = 30
        pendingUpgrades  = []
    }
}
