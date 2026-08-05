import SwiftUI

struct OverviewView: View {
    @ObservedObject var store: InMemoryVaultStore
    @State private var period: Period = .month

    enum Period: String, CaseIterable, Identifiable {
        case week = "Week"
        case month = "Month"
        case custom = "Custom"

        var id: String { rawValue }
    }

    private var summary: Summary {
        let spent = store.transactions.filter { $0.amount.minorUnits < 0 }.reduce(Int64(0)) { $0 + abs($1.amount.minorUnits) }
        let credits = store.transactions.filter { $0.amount.minorUnits > 0 }.reduce(Int64(0)) { $0 + $1.amount.minorUnits }
        return Summary(
            totalSpent: Money(minorUnits: spent),
            credits: Money(minorUnits: credits),
            netActivity: Money(minorUnits: credits - spent),
            transactionCount: store.transactions.count
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ExpenseTrackerTokens.sectionSpacing) {
                header
                Picker("Summary period", selection: $period) {
                    ForEach(Period.allCases) { value in
                        Text(value.rawValue).tag(value)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityHint("Choose the period used for the summary")

                summaryGrid

                if store.transactions.isEmpty {
                    emptyState
                } else {
                    recentActivity
                }
            }
            .padding(.horizontal, ExpenseTrackerTokens.screenPadding)
            .padding(.vertical, 16)
        }
        .background(ExpenseTrackerTokens.background.ignoresSafeArea())
        .navigationTitle("Overview")
        .navigationBarTitleDisplayMode(.large)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Your local picture")
                .font(.title2.weight(.semibold))
                .foregroundStyle(ExpenseTrackerTokens.primaryText)
            Text("Private by default. Nothing is uploaded unless you pair with your own relay.")
                .font(.subheadline)
                .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var summaryGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            SummaryCard(title: "Total spent", value: format(summary.totalSpent), systemImage: "arrow.up.right", tint: ExpenseTrackerTokens.accent)
            SummaryCard(title: "Credits", value: format(summary.credits), systemImage: "arrow.down.left", tint: ExpenseTrackerTokens.positive)
            SummaryCard(title: "Net activity", value: format(summary.netActivity), systemImage: "equal.circle", tint: ExpenseTrackerTokens.primaryText)
            SummaryCard(title: "Transactions", value: "\(summary.transactionCount)", systemImage: "number", tint: ExpenseTrackerTokens.secondaryText)
        }
    }

    private var recentActivity: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent activity")
                .font(.headline)
            ForEach(Array(store.transactions.prefix(5))) { transaction in
                TransactionSummaryRow(transaction: transaction)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Recent activity")
    }

    private var emptyState: some View {
        ExpenseTrackerCard {
            VStack(alignment: .leading, spacing: 10) {
                Label("Your vault is ready", systemImage: "lock.shield")
                    .font(.headline)
                Text("Add an expense or import a statement to see your local spending picture.")
                    .font(.body)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func format(_ money: Money) -> String {
        let amount = Double(money.minorUnits) / 100
        return amount.formatted(.currency(code: money.currency))
    }
}

private struct SummaryCard: View {
    let title: String
    let value: String
    let systemImage: String
    let tint: Color

    var body: some View {
        ExpenseTrackerCard {
            VStack(alignment: .leading, spacing: 10) {
                Label(title, systemImage: systemImage)
                    .font(.subheadline)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                Text(value)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(tint)
                    .minimumScaleFactor(0.75)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }
}

private struct TransactionSummaryRow: View {
    let transaction: ExpenseTransaction

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "circle.fill")
                .font(.caption)
                .foregroundStyle(transaction.amount.minorUnits < 0 ? ExpenseTrackerTokens.accent : ExpenseTrackerTokens.positive)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.merchant)
                    .font(.body.weight(.medium))
                Text(transaction.category)
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }
            Spacer(minLength: 8)
            Text(transaction.amount.minorUnits.formatted())
                .font(.body.monospacedDigit())
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.merchant), \(transaction.category)")
        .accessibilityValue("\(transaction.amount.minorUnits) cents")
    }
}
