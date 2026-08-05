import SwiftUI

struct SettingsView: View {
    @ObservedObject var pendingQueue: PendingMutationQueue
    @AppStorage("relayEnabled") private var relayEnabled = false

    var body: some View {
        Form {
            Section("Privacy") {
                Label("Local vault", systemImage: "lock.shield")
                Text("Your transactions and statement data stay on this device unless you explicitly pair with your own PC relay.")
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }

            Section("Sync") {
                Toggle("Use my local relay", isOn: $relayEnabled)
                    .accessibilityHint("Allows foreground synchronization with a relay you control")
                LabeledContent("Pending", value: pendingQueue.count == 0 ? "None" : "\(pendingQueue.count) item(s)")
                Label(
                    pendingQueue.count == 0 ? "Saved locally" : "Waiting to sync",
                    systemImage: pendingQueue.count == 0 ? "checkmark.circle" : "arrow.triangle.2.circlepath"
                )
                .foregroundStyle(pendingQueue.count == 0 ? ExpenseTrackerTokens.positive : ExpenseTrackerTokens.warning)
                Text("Sync is foreground-only in the first release. The relay is optional and never replaces the local vault.")
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }

            Section("Data") {
                Button("Export encrypted vault") { }
                    .accessibilityHint("Creates an encrypted backup for recovery")
                Button("Clear local data", role: .destructive) { }
                    .accessibilityHint("Permanently removes this device's local vault after confirmation")
            }
        }
        .navigationTitle("Settings")
    }
}
