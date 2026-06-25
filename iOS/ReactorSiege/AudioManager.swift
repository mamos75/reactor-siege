// /Users/mamospower/chain-reactors/iOS/ReactorSiege/AudioManager.swift
// Reactor Siege — Audio management using AVFoundation

import AVFoundation
import SpriteKit

// MARK: - AudioManager
/// Singleton that handles music layers and SFX playback.
/// All audio files are expected in the main bundle.
final class AudioManager {

    // MARK: Shared instance
    static let shared = AudioManager()
    private init() {}

    // MARK: Music players
    private var homePlayer:    AVAudioPlayer?
    private var gamePlayer:    AVAudioPlayer?
    private var ambientPlayer: AVAudioPlayer?

    // MARK: Volumes
    private let homeVolume:    Float = 0.7
    private let gameVolume:    Float = 0.7
    private let ambientVolume: Float = 0.18
    private let sfxVolume:     Float = 1.0

    // MARK: State
    private var currentMusic: String = ""

    // MARK: Setup
    func setupAudio() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("AudioManager: AVAudioSession setup failed: \(error)")
        }

        homePlayer    = makePlayer(named: "music_home",    ext: "mp3")
        gamePlayer    = makePlayer(named: "music",         ext: "mp3")
        ambientPlayer = makePlayer(named: "music_ambient", ext: "mp3")

        homePlayer?.numberOfLoops    = -1
        gamePlayer?.numberOfLoops    = -1
        ambientPlayer?.numberOfLoops = -1

        homePlayer?.volume    = homeVolume
        gamePlayer?.volume    = 0
        ambientPlayer?.volume = 0
    }

    // MARK: Music control
    func playHomeMusic() {
        guard currentMusic != "home" else { return }
        currentMusic = "home"

        gamePlayer?.pause()
        ambientPlayer?.pause()

        homePlayer?.volume     = 0
        homePlayer?.currentTime = 0
        homePlayer?.play()
        fadeIn(player: homePlayer, toVolume: homeVolume, duration: 1.5)
    }

    func playGameMusic() {
        guard currentMusic != "game" else { return }
        currentMusic = "game"

        // Crossfade home → game
        fadeOut(player: homePlayer, duration: 1.0)

        gamePlayer?.volume     = 0
        gamePlayer?.currentTime = 0
        gamePlayer?.play()
        fadeIn(player: gamePlayer, toVolume: gameVolume, duration: 1.5)

        ambientPlayer?.volume      = 0
        ambientPlayer?.currentTime = 0
        ambientPlayer?.play()
        fadeIn(player: ambientPlayer, toVolume: ambientVolume, duration: 2.0)
    }

    func stopMusic() {
        fadeOut(player: homePlayer,    duration: 0.6)
        fadeOut(player: gamePlayer,    duration: 0.6)
        fadeOut(player: ambientPlayer, duration: 0.6)
        currentMusic = ""
    }

    // MARK: SFX playback
    func playSFX(named name: String) {
        guard let player = makePlayer(named: name, ext: "mp3") else { return }
        player.volume = sfxVolume
        player.numberOfLoops = 0
        player.play()
        // Keep alive until playback ends — store in a temporary set
        sfxRetain.insert(player)
        // Remove after expected playback time
        DispatchQueue.main.asyncAfter(deadline: .now() + player.duration + 0.2) { [weak self] in
            self?.sfxRetain.remove(player)
        }
    }

    // Retains transient SFX players
    private var sfxRetain: Set<AVAudioPlayer> = []

    // MARK: Convenience SFX names
    func playExplosion() { playSFX(named: "explosion") }
    func playArcade()    { playSFX(named: "arcade")    }
    func playMove()      { /* intentionally silent; add "move.mp3" to bundle for sound */ }

    // MARK: Private helpers
    private func makePlayer(named name: String, ext: String) -> AVAudioPlayer? {
        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
            // Audio file not found — silently skip (dev may not have audio assets yet)
            return nil
        }
        do {
            return try AVAudioPlayer(contentsOf: url)
        } catch {
            print("AudioManager: failed to load \(name).\(ext): \(error)")
            return nil
        }
    }

    private func fadeIn(player: AVAudioPlayer?, toVolume target: Float, duration: TimeInterval) {
        guard let player = player else { return }
        player.setVolume(target, fadeDuration: duration)
    }

    private func fadeOut(player: AVAudioPlayer?, duration: TimeInterval) {
        guard let player = player else { return }
        player.setVolume(0, fadeDuration: duration)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration + 0.1) {
            player.pause()
        }
    }
}

// MARK: - AVAudioPlayer Hashable conformance (for Set storage)
extension AVAudioPlayer: @retroactive Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(ObjectIdentifier(self))
    }
    public static func == (lhs: AVAudioPlayer, rhs: AVAudioPlayer) -> Bool {
        return lhs === rhs
    }
}
