import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: InMemoryVaultStore
    @ObservedObject var pendingQueue: PendingMutationQueue
    @AppStorage("relayEnabled") private var relayEnabled = false
    @State private var rules: [PersonalCategoryRule] = []
    @State private var matcher = ""
    @State private var selectedCategory = "Food and Dining"
    @State private var removedRule: PersonalCategoryRule?
    @State private var statusMessage: String?
    @State private var backupData: Data?
    @State private var backupPassword = ""
    @State private var showBackupPassword = false
    @State private var showClearConfirmation = false

    private let categories = ["Food and Dining", "Transportation", "Shopping", "Bills and Utilities", "Entertainment", "Health", "Travel", "Income", "Transfers", "Other"]

    var body: some View {
        Form {
            Section("Privacy") {
                Label("Local vault", systemImage: "lock.shield")
                Text(PrivacyCopy.localVault)
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                Text(PrivacyCopy.noAccount)
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }

            Section("Personal categorization") {
                Text("Rules are local memory for future imports. They do not rewrite confirmed history automatically.")
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                TextField("Merchant pattern", text: $matcher)
                    .textInputAutocapitalization(.never)
                    .accessibilityLabel("Merchant pattern")
                Picker("Apply category", selection: $selectedCategory) {
                    ForEach(categories, id: \.self) { Text($0).tag($0) }
                }
                Button("Save rule") { saveRule() }
                    .disabled(matcher.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if rules.isEmpty {
                    Text("No personal rules yet")
                        .font(.footnote)
                        .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                } else {
                    ForEach(rules) { rule in
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(rule.matcher).font(.body.weight(.medium))
                                Text("\(rule.category) · \(rule.evidenceCount) confirmation\(rule.evidenceCount == 1 ? "" : "s")")
                                    .font(.footnote)
                                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                            }
                            Spacer()
                            Toggle("Enabled", isOn: Binding(
                                get: { rule.isActive },
                                set: { isActive in updateRule(rule, isActive: isActive) }
                            ))
                            .labelsHidden()
                            Button("Remove", role: .destructive) { removeRule(rule) }
                                .accessibilityLabel("Remove rule for \(rule.matcher)")
                        }
                    }
                }
                if let statusMessage {
                    Label(statusMessage, systemImage: "checkmark.circle")
                        .foregroundStyle(ExpenseTrackerTokens.positive)
                        .accessibilityElement(children: .combine)
                }
                if removedRule != nil {
                    Button("Undo removed rule") { undoRemoval() }
                        .accessibilityHint("Restores the most recently removed personal rule")
                }
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

            Section("Statement retention") {
                Text(PrivacyCopy.retention)
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }

            Section("Data") {
                Text(PrivacyCopy.deletion)
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                Button("Export encrypted vault") { showBackupPassword = true }
                    .accessibilityHint("Creates an encrypted backup for recovery")
                if let backupData {
                    ShareLink(item: backupData, preview: SharePreview("Expense Tracker encrypted vault")) {
                        Label("Share encrypted backup", systemImage: "square.and.arrow.up")
                    }
                }
                Button("Clear local data", role: .destructive) { showClearConfirmation = true }
                    .accessibilityHint("Permanently removes this device's local vault after confirmation")
            }
        }
        .navigationTitle("Settings")
        .alert("Protect encrypted backup", isPresented: $showBackupPassword) {
            SecureField("Password (8+ characters)", text: $backupPassword)
            Button("Create backup") { exportVault() }
            Button("Cancel", role: .cancel) { backupPassword = "" }
        } message: {
            Text("Store this password separately. It cannot be recovered by the app.")
        }
        .confirmationDialog("Clear all local data?", isPresented: $showClearConfirmation, titleVisibility: .visible) {
            Button("Clear local data", role: .destructive) { clearLocalData() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This removes this device's transactions, rules, pending changes, and local vault copy. Other-device copies remain unchanged.")
        }
    }

    private func exportVault() {
        do {
            backupData = try NativeVaultBackup.create(vaultId: "ios-local-vault", transactions: store.transactions, password: backupPassword)
            backupPassword = ""
            statusMessage = "Encrypted vault backup is ready to share"
        } catch {
            statusMessage = "Use a password with at least 8 characters to create a backup"
        }
    }

    private func clearLocalData() {
        guard !pendingQueue.pendingMutations.isEmpty || !rules.isEmpty || !store.transactions.isEmpty else {
            statusMessage = "Local vault is already empty"
            return
        }
        pendingQueue.acknowledge(pendingQueue.pendingIDs)
        rules.removeAll()
        store.clearAll()
        backupData = nil
        statusMessage = "Local data cleared from this device"
    }

    private func saveRule() {
        let clean = matcher.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !clean.isEmpty else { return }
        if let index = rules.firstIndex(where: { $0.matcher == clean && $0.category == selectedCategory }) {
            rules[index].evidenceCount += 1
            rules[index].isActive = true
        } else {
            rules.append(PersonalCategoryRule(matcher: clean, category: selectedCategory))
        }
        matcher = ""
        statusMessage = "Personal rule saved locally"
        pendingQueue.enqueue(PendingMutation(entityId: UUID(), operation: "rule-update"))
    }

    private func updateRule(_ rule: PersonalCategoryRule, isActive: Bool) {
        guard let index = rules.firstIndex(of: rule) else { return }
        rules[index].isActive = isActive
        statusMessage = isActive ? "Personal rule enabled" : "Personal rule disabled"
        pendingQueue.enqueue(PendingMutation(entityId: rule.id, operation: "rule-update"))
    }

    private func removeRule(_ rule: PersonalCategoryRule) {
        rules.removeAll { $0.id == rule.id }
        removedRule = rule
        statusMessage = "Personal rule removed"
        pendingQueue.enqueue(PendingMutation(entityId: rule.id, operation: "rule-delete"))
    }

    private func undoRemoval() {
        guard let removedRule else { return }
        rules.append(removedRule)
        self.removedRule = nil
        statusMessage = "Personal rule restored"
        pendingQueue.enqueue(PendingMutation(entityId: removedRule.id, operation: "rule-restore"))
    }
}
