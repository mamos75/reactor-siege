// /Users/mamospower/chain-reactors/iOS/ReactorSiege/Reactor.swift
// Reactor Siege — Core reactor simulation (heat, energy, meltdown)

import SpriteKit

// MARK: - Reactor
/// Tracks the reactor's heat and energy levels.  Called every update tick by GameScene.
class Reactor {

    // MARK: State
    var heat: CGFloat    = 0          // 0 – reactorHeatCap
    var energy: CGFloat  = 0          // 0 – reactorMaxEnergy
    var coolingRate: CGFloat = GC.reactorCoolingRate

    /// True if the reactor is actively melting down this frame (handled once per event)
    private(set) var meltdownTriggered: Bool = false

    // MARK: Update
    /// Call every frame with the elapsed seconds.  Returns true if a meltdown occurred this tick.
    @discardableResult
    func update(dt: TimeInterval, state: GameState) -> Bool {
        let effective = coolingRate + state.coolingRateBonus
        heat -= CGFloat(dt) * effective
        heat = max(0, heat)

        meltdownTriggered = false
        if heat >= GC.reactorMaxHeat {
            meltdownTriggered = true
        }
        return meltdownTriggered
    }

    // MARK: Apply heat from bomb
    func applyHeat(_ delta: CGFloat) {
        heat = min(heat + delta, GC.reactorHeatCap)
    }

    // MARK: Add energy
    func addEnergy(_ amount: CGFloat) {
        energy = min(energy + amount, GC.reactorMaxEnergy)
    }

    // MARK: Consume energy for a bomb
    /// Returns false if not enough energy.
    func consumeEnergy(for bomb: BombType) -> Bool {
        let cost = bomb.cost
        if energy < cost { return false }
        energy -= cost
        return true
    }

    // MARK: Heat fraction (0-1, clamped for display)
    var heatFraction: CGFloat {
        return min(heat / GC.reactorMaxHeat, 1)
    }

    // MARK: Energy fraction (0-1)
    var energyFraction: CGFloat {
        return energy / GC.reactorMaxEnergy
    }

    // MARK: Critical flag
    var isCritical: Bool { heat / GC.reactorMaxHeat >= 0.85 }

    // MARK: Handle meltdown consequences
    /// Shield check is done in GameScene; call this after shield/damage logic.
    func resetAfterMeltdown() {
        heat = GC.meltdownResetHeat
        meltdownTriggered = false
    }

    // MARK: Reset
    func reset() {
        heat             = 0
        energy           = 0
        coolingRate      = GC.reactorCoolingRate
        meltdownTriggered = false
    }
}
