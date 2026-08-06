import SwiftUI

struct OverviewView: View {
    @ObservedObject var store: InMemoryVaultStore
    @State private var period: Period = .month
    @State private var customStart = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var customEnd = Date()

    enum Period: String, CaseIterable, Identifiable {
        case week = "Week"
        case month = "Month"
        case custom = "Custom"

        var id: String { rawValue }
    }

    private var activeTransactions: [ExpenseTransaction] {
        guard period != .custom || customEnd >= customStart else { return [] }
        return store.transactions.filter { transaction in
            let day = Calendar.current.startOfDay(for: transaction.occurredOn)
            let today = Calendar.current.startOfDay(for: Date())
            switch period {
            case .week:
                guard let weekInterval = Calendar.current.dateInterval(of: .weekOfYear, for: today) else { return false }
                return weekInterval.contains(day)
            case .month:
                guard let monthInterval = Calendar.current.dateInterval(of: .month, for: today) else { return false }
                return monthInterval.contains(day)
            case .custom:
                let start = Calendar.current.startOfDay(for: customStart)
                let end = Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: customEnd) ?? customEnd
                return day >= start && day <= end
            }
        }
    }

    private var summary: Summary {
        let spent = activeTransactions.filter { $0.amount.minorUnits < 0 }.reduce(Int64(0)) { $0 + abs($1.amount.minorUnits) }
        let credits = activeTransactions.filter { $0.amount.minorUnits > 0 }.reduce(Int64(0)) { $0 + $1.amount.minorUnits }
        return Summary(
            totalSpent: Money(minorUnits: spent),
            credits: Money(minorUnits: credits),
            netActivity: Money(minorUnits: credits - spent),
            transactionCount: activeTransactions.count
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

                if period == .custom {
                    DatePicker("From", selection: $customStart, displayedComponents: .date)
                    DatePicker("To", selection: $customEnd, displayedComponents: .date)
                    if customEnd < customStart {
                        Text("Choose an end date on or after the start date.")
                            .font(.footnote)
                            .foregroundStyle(ExpenseTrackerTokens.destructive)
                            .accessibilityLabel("Invalid custom date range")
                    }
                }

                summaryGrid

                if activeTransactions.isEmpty {
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
            ForEach(Array(activeTransactions.prefix(5))) { transaction in
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
                Text("Try another period, add an expense, or import a statement to see your local spending picture.")
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
