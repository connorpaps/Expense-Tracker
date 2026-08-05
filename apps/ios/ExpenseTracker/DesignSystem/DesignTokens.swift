import SwiftUI
import UIKit

public extension Color {
    init(expenseHex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((expenseHex >> 16) & 0xFF) / 255,
            green: Double((expenseHex >> 8) & 0xFF) / 255,
            blue: Double(expenseHex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

public enum ExpenseTrackerTokens {
    public static let background = Color(UIColor.systemGroupedBackground)
    public static let surface = Color(UIColor.secondarySystemGroupedBackground)
    public static let primaryText = Color(UIColor.label)
    public static let secondaryText = Color(UIColor.secondaryLabel)
    public static let accent = Color(expenseHex: 0xA8521D)
    public static let positive = Color(UIColor.systemGreen)
    public static let warning = Color(UIColor.systemOrange)
    public static let destructive = Color(UIColor.systemRed)
    public static let focus = Color(UIColor.systemBlue)
    public static let review = Color(UIColor.systemOrange)

    public static let screenPadding: CGFloat = 20
    public static let sectionSpacing: CGFloat = 24
    public static let rowSpacing: CGFloat = 12
    public static let minimumTouchTarget: CGFloat = 44
}

public struct ExpenseTrackerCard<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ExpenseTrackerTokens.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
