// /Users/mamospower/chain-reactors/iOS/ReactorSiege/GameConstants.swift
// Reactor Siege — Central constants used across all game systems

import UIKit
import SpriteKit

// MARK: - Grid & Canvas
enum GC {
    // Grid dimensions
    static let cols        = 13
    static let rows        = 13
    static let tileSize: CGFloat = 52
    static let gridOffsetX: CGFloat = 100   // left edge of grid in scene coords
    static let gridOffsetY: CGFloat = 100   // bottom edge of grid in scene coords

    // Scene canvas (logical)
    static let canvasWidth: CGFloat  = 900
    static let canvasHeight: CGFloat = 900

    // Max waves
    static let maxWaves = 8

    // Safe-zone cells — always FLOOR, never soft blocks
    static let safeZone: [(col: Int, row: Int)] = [
        (1,1),(2,1),(1,2),(3,1),(1,3)
    ]

    // Corner spawn positions for enemies
    static let cornerSpawns: [(col: Int, row: Int)] = [
        (1,1),(11,1),(1,11),(11,11)
    ]

    // MARK: - Tile type identifiers
    static let FLOOR = 0
    static let WALL  = 1
    static let SOFT  = 2

    // MARK: - Player tuning
    static let playerStartCol = 1
    static let playerStartRow = 1
    static let playerLives    = 3
    static let moveCooldown: TimeInterval   = 0.080   // seconds between tile steps
    static let moveDuration: TimeInterval   = 0.100   // lerp animation time
    static let invincibleDuration: TimeInterval = 2.0
    static let defaultMaxBombs = 3

    // MARK: - Reactor defaults
    static let reactorMaxHeat: CGFloat   = 100
    static let reactorHeatCap: CGFloat   = 130   // brief exceed limit
    static let reactorMaxEnergy: CGFloat = 200
    static let reactorCoolingRate: CGFloat = 3   // heat lost per second
    static let meltdownResetHeat: CGFloat  = 50
    static let meltdownSoftDestroyPct: CGFloat = 0.40   // 40% soft blocks destroyed

    // MARK: - Combo system
    static let comboTimerDuration: TimeInterval = 2.0
    static let maxCombo = 20
    static let baseKillScore = 100

    // MARK: - Wave clear bonus
    static let waveClearBonus = 500

    // MARK: - Joystick
    static let joystickRadius: CGFloat = 55
    static let joystickDeadZone: CGFloat = 0.25   // 25 %

    // MARK: - CRYO freeze duration
    static let cryoFreezeDuration: TimeInterval = 3.0

    // MARK: - Energy gain per explosion
    static let energyPerExplosionPower: CGFloat = 3   // × bomb.power

    // MARK: - Colors (Neon palette)
    static let colorBackground   = UIColor(hex: "#050510")
    static let colorWall         = UIColor(hex: "#0a1a3a")
    static let colorWallBorder   = UIColor(hex: "#00ffff")
    static let colorSoft         = UIColor(hex: "#1a0030")
    static let colorSoftDetail   = UIColor(hex: "#8800cc")
    static let colorFloor        = UIColor(hex: "#080818")
    static let colorPlayer       = UIColor(hex: "#00ffff")
    static let colorChaser       = UIColor(hex: "#ff6600")
    static let colorSaboteur     = UIColor(hex: "#ff00ff")
    static let colorCoward       = UIColor(hex: "#ffff00")
    static let colorExplosion    = UIColor(hex: "#ff4400")
    static let colorHeat         = UIColor(hex: "#ff3300")
    static let colorEnergy       = UIColor(hex: "#00aaff")
    static let colorHUD          = UIColor(hex: "#ccddff")
    static let colorCritical     = UIColor(hex: "#ff0000")
    static let colorCombo        = UIColor(hex: "#ffdd00")

    // MARK: - HUD layout
    static let hudLeftWidth: CGFloat   = 95
    static let hudRightStart: CGFloat  = 805
    static let hudBottomStart: CGFloat = 840
}

// MARK: - Bomb Type enum
enum BombType: Int, CaseIterable {
    case basic = 0
    case chain = 1
    case cryo  = 2
    case nuke  = 3

    var displayName: String {
        switch self {
        case .basic: return "BASIC"
        case .chain: return "CHAIN"
        case .cryo:  return "CRYO"
        case .nuke:  return "NUKE"
        }
    }

    var power: Int {
        switch self {
        case .basic: return 2
        case .chain: return 3
        case .cryo:  return 1
        case .nuke:  return 6
        }
    }

    var heat: CGFloat {
        switch self {
        case .basic: return  8
        case .chain: return  15
        case .cryo:  return -10
        case .nuke:  return  35
        }
    }

    var cost: CGFloat {
        switch self {
        case .basic: return  0
        case .chain: return  20
        case .cryo:  return  30
        case .nuke:  return  60
        }
    }

    var delay: TimeInterval {
        switch self {
        case .basic: return 2.0
        case .chain: return 1.0
        case .cryo:  return 1.5
        case .nuke:  return 3.0
        }
    }

    var range: Int {
        switch self {
        case .basic: return 2
        case .chain: return 3
        case .cryo:  return 2
        case .nuke:  return 5
        }
    }

    var color: UIColor {
        switch self {
        case .basic: return UIColor(hex: "#00ffff")
        case .chain: return UIColor(hex: "#ff00ff")
        case .cryo:  return UIColor(hex: "#4488ff")
        case .nuke:  return UIColor(hex: "#ff8800")
        }
    }
}

// MARK: - Enemy Type enum
enum EnemyType: Int {
    case chaser   = 0
    case saboteur = 1
    case coward   = 2

    var displayName: String {
        switch self {
        case .chaser:   return "CHASER"
        case .saboteur: return "SABOTEUR"
        case .coward:   return "COWARD"
        }
    }

    var hp: Int {
        switch self {
        case .chaser:   return 1
        case .saboteur: return 2
        case .coward:   return 1
        }
    }

    var baseMoveInterval: TimeInterval {
        switch self {
        case .chaser:   return 0.800
        case .saboteur: return 1.200
        case .coward:   return 1.000
        }
    }

    var color: UIColor {
        switch self {
        case .chaser:   return UIColor(hex: "#ff6600")
        case .saboteur: return UIColor(hex: "#ff00ff")
        case .coward:   return UIColor(hex: "#ffff00")
        }
    }

    var heatPerMove: CGFloat {
        switch self {
        case .coward: return 5
        default:      return 0
        }
    }
}

// MARK: - Upgrade Type enum
enum UpgradeType: Int, CaseIterable {
    case cooling    = 0
    case chainAmp   = 1
    case energy     = 2
    case plating    = 3
    case slot       = 4
    case shield     = 5
    case heatsink   = 6
    case overcharge = 7

    var displayName: String {
        switch self {
        case .cooling:    return "COOLING"
        case .chainAmp:   return "CHAIN AMP"
        case .energy:     return "ENERGY"
        case .plating:    return "PLATING"
        case .slot:       return "EXTRA SLOT"
        case .shield:     return "SHIELD"
        case .heatsink:   return "HEATSINK"
        case .overcharge: return "OVERCHARGE"
        }
    }

    var description: String {
        switch self {
        case .cooling:    return "Cooling rate +2"
        case .chainAmp:   return "Chain range +1"
        case .energy:     return "Energy +40"
        case .plating:    return "Soft block HP +1"
        case .slot:       return "Max bombs +1"
        case .shield:     return "Reactor shield +1"
        case .heatsink:   return "Heat sink +3"
        case .overcharge: return "Nuke bonus +2"
        }
    }

    var color: UIColor {
        switch self {
        case .cooling:    return UIColor(hex: "#00ffff")
        case .chainAmp:   return UIColor(hex: "#ff00ff")
        case .energy:     return UIColor(hex: "#00aaff")
        case .plating:    return UIColor(hex: "#aaaaaa")
        case .slot:       return UIColor(hex: "#ffaa00")
        case .shield:     return UIColor(hex: "#88ff88")
        case .heatsink:   return UIColor(hex: "#ff6600")
        case .overcharge: return UIColor(hex: "#ff4400")
        }
    }
}

// MARK: - Game Phase enum
enum GamePhase {
    case start
    case playing
    case upgrade
    case gameover
    case win
}

// MARK: - UIColor hex initializer
extension UIColor {
    convenience init(hex: String) {
        var hexStr = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if hexStr.hasPrefix("#") { hexStr.removeFirst() }
        var rgb: UInt64 = 0
        Scanner(string: hexStr).scanHexInt64(&rgb)
        let r = CGFloat((rgb >> 16) & 0xFF) / 255
        let g = CGFloat((rgb >>  8) & 0xFF) / 255
        let b = CGFloat( rgb        & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: 1)
    }
}

// MARK: - CGPoint convenience
extension CGPoint {
    func distance(to other: CGPoint) -> CGFloat {
        let dx = x - other.x; let dy = y - other.y
        return sqrt(dx*dx + dy*dy)
    }
}
