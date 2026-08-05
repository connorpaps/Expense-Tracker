import SwiftUI

@main
struct ExpenseTrackerApp: App {
    @StateObject private var store = InMemoryVaultStore()
    @StateObject private var pendingQueue = PendingMutationQueue()

    var body: some Scene {
        WindowGroup {
            RootView(store: store, pendingQueue: pendingQueue)
        }
    }
}

struct RootView: View {
    @ObservedObject var store: InMemoryVaultStore
    @ObservedObject var pendingQueue: PendingMutationQueue

    var body: some View {
        TabView {
            NavigationStack {
                OverviewView(store: store)
            }
            .tabItem {
                Label("Overview", systemImage: "chart.bar.xaxis")
            }
            .tag(0)

            NavigationStack {
                TransactionsView(store: store)
            }
            .tabItem {
                Label("Transactions", systemImage: "list.bullet.rectangle")
            }
            .tag(1)

            NavigationStack {
                ImportReviewView(store: store, pendingQueue: pendingQueue)
            }
            .tabItem {
                Label("Import", systemImage: "arrow.down.doc")
            }
            .tag(2)

            NavigationStack {
                SettingsView(pendingQueue: pendingQueue)
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape")
            }
            .tag(3)
        }
        .tint(ExpenseTrackerTokens.accent)
    }
}
