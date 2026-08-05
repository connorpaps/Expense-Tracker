export function DashboardPage() {
  return (
    <section className="page" aria-labelledby="dashboard-heading">
      <header className="page__header">
        <h1 id="dashboard-heading">Overview</h1>
        <p className="page__subtitle">Total spent, credits, and category breakdowns for the active period.</p>
      </header>
      <div className="page__body">
        <div className="panel panel--empty" role="status">
          <h2>No spending yet</h2>
          <p>Add a manual expense or import a bank statement to see weekly and monthly summaries.</p>
          <a className="button button--primary" href="#/import">
            Import a statement
          </a>
        </div>
      </div>
    </section>
  );
}
