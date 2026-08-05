export function TransactionsPage() {
  return (
    <section className="page" aria-labelledby="transactions-heading">
      <header className="page__header">
        <h1 id="transactions-heading">Transactions</h1>
        <p className="page__subtitle">Search, filter, and correct categories in your history.</p>
      </header>
      <div className="page__body">
        <div className="panel panel--empty" role="status">
          <h2>Nothing here yet</h2>
          <p>Imported and manually added transactions will appear here with search and category filters.</p>
        </div>
      </div>
    </section>
  );
}
