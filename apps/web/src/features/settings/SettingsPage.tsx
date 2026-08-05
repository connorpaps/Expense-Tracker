export function SettingsPage() {
  return (
    <section className="page" aria-labelledby="settings-heading">
      <header className="page__header">
        <h1 id="settings-heading">Privacy and settings</h1>
        <p className="page__subtitle">Where your data lives, how it synchronizes, and how to back it up.</p>
      </header>
      <div className="page__body">
        <div className="panel">
          <h2>Your data stays on your devices</h2>
          <p>
            Statements are parsed on this computer and stored in an encrypted local vault. No account, cloud
            database, or subscription is required. Pairing your iPhone with the PC relay uses an explicit pairing
            code and encrypted mutation exchange — never a hosted service.
          </p>
          <p>
            Export an encrypted vault backup from this screen before clearing local data. Without a backup, an
            unrecoverable key means unrecoverable vault data.
          </p>
        </div>
      </div>
    </section>
  );
}
