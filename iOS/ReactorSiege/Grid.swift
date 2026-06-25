// /Users/mamospower/chain-reactors/iOS/ReactorSiege/Grid.swift
// Reactor Siege — Grid model: tile storage, soft-block HP, BFS pathfinding

import SpriteKit

// MARK: - Grid Cell
struct GridCell {
    var type: Int        // GC.FLOOR | GC.WALL | GC.SOFT
    var hp:   Int        // hit points (soft blocks start at 1 + upgrades)
}

// MARK: - Grid
/// Owns the logical 13×13 tile grid.  Visual nodes are managed externally by GameScene.
class Grid {

    // MARK: Storage
    private(set) var cells: [[GridCell]]          // [col][row], 0-indexed
    var softBlockBaseHP: Int = 1                  // modified by plating upgrade

    // MARK: Init
    init() {
        // Build empty grid
        cells = Array(repeating:
                    Array(repeating: GridCell(type: GC.FLOOR, hp: 0), count: GC.rows),
                      count: GC.cols)
        buildLayout()
    }

    // MARK: Layout generation
    private func buildLayout() {
        let safeSet = Set(GC.safeZone.map { "\($0.col),\($0.row)" })

        for col in 0..<GC.cols {
            for row in 0..<GC.rows {
                let key = "\(col),\(row)"
                // Border walls
                if col == 0 || col == GC.cols-1 || row == 0 || row == GC.rows-1 {
                    cells[col][row] = GridCell(type: GC.WALL, hp: 0)
                }
                // Interior wall pillars: even col AND even row intersections (Bomberman pattern)
                else if col % 2 == 0 && row % 2 == 0 {
                    cells[col][row] = GridCell(type: GC.WALL, hp: 0)
                }
                // Safe zone — always floor
                else if safeSet.contains(key) {
                    cells[col][row] = GridCell(type: GC.FLOOR, hp: 0)
                }
                // Soft block (50% chance)
                else if Bool.random() {
                    cells[col][row] = GridCell(type: GC.SOFT, hp: softBlockBaseHP)
                } else {
                    cells[col][row] = GridCell(type: GC.FLOOR, hp: 0)
                }
            }
        }
    }

    // MARK: Accessors
    func cell(col: Int, row: Int) -> GridCell? {
        guard inBounds(col: col, row: row) else { return nil }
        return cells[col][row]
    }

    func isPassable(col: Int, row: Int) -> Bool {
        guard let c = cell(col: col, row: row) else { return false }
        return c.type == GC.FLOOR
    }

    func inBounds(col: Int, row: Int) -> Bool {
        return col >= 0 && col < GC.cols && row >= 0 && row < GC.rows
    }

    // MARK: Soft block damage
    /// Returns true if the block was destroyed.
    @discardableResult
    func damageCell(col: Int, row: Int) -> Bool {
        guard inBounds(col: col, row: row) else { return false }
        guard cells[col][row].type == GC.SOFT else { return false }
        cells[col][row].hp -= 1
        if cells[col][row].hp <= 0 {
            cells[col][row] = GridCell(type: GC.FLOOR, hp: 0)
            return true
        }
        return false
    }

    /// Force-clear a cell to floor (used by meltdown and nuke).
    func clearCell(col: Int, row: Int) {
        guard inBounds(col: col, row: row) else { return }
        if cells[col][row].type == GC.SOFT {
            cells[col][row] = GridCell(type: GC.FLOOR, hp: 0)
        }
    }

    /// Collect all soft block positions.
    func allSoftPositions() -> [(col: Int, row: Int)] {
        var result: [(col: Int, row: Int)] = []
        for col in 0..<GC.cols {
            for row in 0..<GC.rows {
                if cells[col][row].type == GC.SOFT {
                    result.append((col, row))
                }
            }
        }
        return result
    }

    // MARK: BFS Pathfinding
    /// Returns next step (col,row) toward target, or nil if unreachable / already adjacent.
    func bfsNextStep(from start: (col: Int, row: Int),
                     to target: (col: Int, row: Int)) -> (col: Int, row: Int)? {
        if start.col == target.col && start.row == target.row { return nil }

        // Standard BFS on passable + target tiles
        typealias Pos = (col: Int, row: Int)
        var visited = Set<String>()
        var queue: [(pos: Pos, path: [Pos])] = []
        let startKey = "\(start.col),\(start.row)"
        visited.insert(startKey)
        queue.append((start, []))

        let dirs: [Pos] = [(0,1),(0,-1),(1,0),(-1,0)]

        while !queue.isEmpty {
            let current = queue.removeFirst()
            for d in dirs {
                let next = (col: current.pos.col + d.col, row: current.pos.row + d.row)
                let key = "\(next.col),\(next.row)"
                guard !visited.contains(key) else { continue }
                visited.insert(key)

                // Allow movement to target even if it has an entity on it
                let isTarget = next.col == target.col && next.row == target.row
                guard isPassable(col: next.col, row: next.row) || isTarget else { continue }

                var newPath = current.path
                newPath.append(next)

                if isTarget {
                    return newPath.first ?? next
                }
                queue.append((next, newPath))
            }
        }
        return nil
    }

    /// BFS to find the nearest position among a set of targets.
    func bfsNearestTarget(from start: (col: Int, row: Int),
                          targets: [(col: Int, row: Int)]) -> (col: Int, row: Int)? {
        guard !targets.isEmpty else { return nil }
        let targetSet = Set(targets.map { "\($0.col),\($0.row)" })
        if targetSet.contains("\(start.col),\(start.row)") { return start }

        typealias Pos = (col: Int, row: Int)
        var visited = Set<String>()
        var queue: [(pos: Pos, path: [Pos])] = []
        visited.insert("\(start.col),\(start.row)")
        queue.append((start, []))

        let dirs: [Pos] = [(0,1),(0,-1),(1,0),(-1,0)]

        while !queue.isEmpty {
            let current = queue.removeFirst()
            for d in dirs {
                let next = (col: current.pos.col + d.col, row: current.pos.row + d.row)
                let key = "\(next.col),\(next.row)"
                guard !visited.contains(key) else { continue }
                visited.insert(key)

                let isTarget = targetSet.contains(key)
                guard isPassable(col: next.col, row: next.row) || isTarget else { continue }

                var newPath = current.path
                newPath.append(next)

                if isTarget {
                    return newPath.first ?? next
                }
                queue.append((next, newPath))
            }
        }
        return nil
    }

    // MARK: Explosion blast calculation
    struct BlastCell {
        var col: Int
        var row: Int
        var destroysSoft: Bool
    }

    /// Returns all cells hit by an explosion centered at (col,row) with given range.
    /// Stops at WALLs (excluded), stops at SOFT (included).
    func blastCells(col: Int, row: Int, range: Int) -> [BlastCell] {
        var result: [BlastCell] = []
        // Center always included
        let centerType = cells[col][row].type
        result.append(BlastCell(col: col, row: row, destroysSoft: centerType == GC.SOFT))

        let dirs = [(0,1),(0,-1),(1,0),(-1,0)]
        for (dc, dr) in dirs {
            for dist in 1...range {
                let nc = col + dc * dist
                let nr = row + dr * dist
                guard inBounds(col: nc, row: nr) else { break }
                let t = cells[nc][nr].type
                if t == GC.WALL { break }
                result.append(BlastCell(col: nc, row: nr, destroysSoft: t == GC.SOFT))
                if t == GC.SOFT { break }   // blast stops at first soft block
            }
        }
        return result
    }

    // MARK: Reset
    func reset() {
        softBlockBaseHP = 1
        buildLayout()
    }
}
