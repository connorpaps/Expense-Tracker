import CryptoKit
import Foundation

public enum NativeVaultBackupError: Error, Equatable {
    case invalidPassword
    case invalidBackup
    case wrongPasswordOrDamagedBackup
}

public struct NativeVaultBackup: Codable, Sendable {
    public let format: String
    public let vaultId: String
    public let salt: Data
    public let nonce: Data
    public let ciphertext: Data

    private static let formatName = "expense-tracker-vault-v1"

    public static func create(
        vaultId: String,
        transactions: [ExpenseTransaction],
        password: String
    ) throws -> Data {
        guard password.count >= 8 else { throw NativeVaultBackupError.invalidPassword }
        let salt = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
        let nonce = Data((0..<12).map { _ in UInt8.random(in: 0...255) })
        let key = deriveKey(password: password, salt: salt)
        let plaintext = try JSONEncoder().encode(transactions)
        let sealed = try AES.GCM.seal(plaintext, using: key, nonce: try AES.GCM.Nonce(data: nonce))
        let backup = NativeVaultBackup(
            format: formatName,
            vaultId: vaultId,
            salt: salt,
            nonce: nonce,
            ciphertext: sealed.ciphertext + sealed.tag
        )
        return try JSONEncoder().encode(backup)
    }

    public static func restore(_ data: Data, password: String) throws -> [ExpenseTransaction] {
        guard password.count >= 8 else { throw NativeVaultBackupError.invalidPassword }
        guard let backup = try? JSONDecoder().decode(NativeVaultBackup.self, from: data),
              backup.format == formatName,
              backup.salt.count == 16,
              backup.nonce.count == 12,
              backup.ciphertext.count > 16 else { throw NativeVaultBackupError.invalidBackup }
        do {
            let key = deriveKey(password: password, salt: backup.salt)
            let tagStart = backup.ciphertext.count - 16
            let sealed = try AES.GCM.SealedBox(
                nonce: AES.GCM.Nonce(data: backup.nonce),
                ciphertext: backup.ciphertext[..<tagStart],
                tag: backup.ciphertext[tagStart...]
            )
            return try JSONDecoder().decode([ExpenseTransaction].self, from: AES.GCM.open(sealed, using: key))
        } catch {
            throw NativeVaultBackupError.wrongPasswordOrDamagedBackup
        }
    }

    private static func deriveKey(password: String, salt: Data) -> SymmetricKey {
        let material = SymmetricKey(data: Data(password.utf8))
        return HKDF<SHA256>.deriveKey(inputKeyMaterial: material, salt: salt, info: Data("expense-tracker-vault-backup-v1".utf8), outputByteCount: 32)
    }
}
