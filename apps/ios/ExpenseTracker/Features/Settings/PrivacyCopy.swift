import Foundation

enum PrivacyCopy {
    static let localVault = "Your transactions and statement data stay on this device unless you explicitly pair with your own PC relay."
    static let retention = "Statement originals are optional local source data. You can remove them while keeping normalized history."
    static let deletion = "Delete imported records or clear this device's local vault after confirmation. Unsynchronized changes and other-device copies are not removed."
    static let noAccount = "No hosted account or paid cloud service is required for local entry, imports, summaries, and history."
}
