import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORY_SOURCE_LABELS } from '@expense-tracker/contracts';
import {
  CURRENCY_DISPLAY,
  ISO_CURRENCY_CODES,
  categorySlug,
  insertCategory,
  insertRule,
  listCategories,
  listRules,
  persistMutation,
  reorderCategories,
  mergeCategory,
  updateCategory,
  updateCategoryActive,
  updateRule,
  pendingMutationCount,
  listStatementImports,
  deleteStatementOriginals,
  deleteImportedRecords,
  deleteVaultLocally,
  getVault,
  isCurrencyCode,
  updateVault,
} from '@expense-tracker/domain';
import type { Category, CategoryKind, CategorizationRule, Db } from '@expense-tracker/domain';
import type { VaultStore } from '../../local';
import { createLocalVault, refreshVaultStore } from '../../local';
import {
  clearLocalData,
  downloadVaultExport,
  encryptMutationPayload,
  exportVault,
  importAsNewVault,
  parseVaultExport,
  mutationEnvelopeContext,
} from '../../local';

interface SettingsPageProps {
  db: Db;
  vaultId: string;
  onVaultChange?: (store: VaultStore) => void;
}

type CategoryForm = {
  name: string;
  kind: CategoryKind;
};

const emptyCategoryForm: CategoryForm = { name: '', kind: 'expense' };

type ImportCandidate = {
  fileName: string;
  snapshot: Awaited<ReturnType<typeof parseVaultExport>>;
};

type PasswordAction = { kind: 'export' } | { kind: 'import'; file: File };

export function SettingsPage({ db, vaultId, onVaultChange }: SettingsPageProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [undoRule, setUndoRule] = useState<CategorizationRule | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm);
  const [ruleCategoryId, setRuleCategoryId] = useState('');
  const [ruleMatcher, setRuleMatcher] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleMatcher, setEditingRuleMatcher] = useState('');
  const [editingRuleCategoryId, setEditingRuleCategoryId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [statementImports, setStatementImports] = useState<
    Awaited<ReturnType<typeof listStatementImports>>
  >([]);
  const [selectedImportId, setSelectedImportId] = useState('');
  const [passwordAction, setPasswordAction] = useState<PasswordAction | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [vaultLabel, setVaultLabel] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('CAD');
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [nextCategories, nextRules, nextPendingSyncCount, nextStatementImports, vault] =
      await Promise.all([
        listCategories(db, vaultId),
        listRules(db, vaultId, false),
        pendingMutationCount(db, vaultId),
        listStatementImports(db, vaultId),
        getVault(db, vaultId),
      ]);
    setCategories(nextCategories);
    setRules(nextRules);
    setPendingSyncCount(nextPendingSyncCount);
    setStatementImports(nextStatementImports);
    setDefaultCurrency(vault?.default_currency ?? 'CAD');
    setSelectedImportId((current) => current || nextStatementImports[0]?.id || '');
    setRuleCategoryId(
      (current) => current || nextCategories.find((category) => category.is_active)?.id || '',
    );
  }, [db, vaultId]);

  useEffect(() => {
    void refresh().catch((cause) => {
      console.error('Settings refresh failed', cause);
      setError('Settings could not be loaded. Reload the app and try again.');
    });
  }, [refresh]);

  const runMutation = async (input: {
    entityType: 'vault' | 'category' | 'categorization_rule';
    entityId: string;
    operation: 'create' | 'update' | 'delete' | 'merge' | 'category_update' | 'rule_update';
    changedFields: string[];
    payload: unknown;
    baseVersion?: number;
    apply: (transactionDb: Db) => Promise<void>;
  }) => {
    const now = new Date().toISOString();
    const mutationId = crypto.randomUUID();
    const ciphertext = await encryptMutationPayload(
      input.payload,
      mutationEnvelopeContext({
        mutation_id: mutationId,
        vault_id: vaultId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        operation: input.operation,
        base_version: input.baseVersion ?? 0,
        changed_fields: input.changedFields,
      }),
    );
    await persistMutation(db, {
      mutationId,
      vaultId,
      deviceId: 'web',
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      baseVersion: input.baseVersion ?? 0,
      changedFields: input.changedFields,
      ciphertext,
      origin: 'web',
      now,
      apply: input.apply,
    });
  };

  const saveDefaultCurrency = async (currency: string) => {
    if (!isCurrencyCode(currency) || currency === defaultCurrency) return;
    const now = new Date().toISOString();
    setBusy(true);
    try {
      await runMutation({
        entityType: 'vault',
        entityId: vaultId,
        operation: 'update',
        changedFields: ['default_currency'],
        payload: {
          entity: 'vault',
          value: { id: vaultId, vault_id: vaultId, default_currency: currency, updated_at: now },
        },
        apply: (transactionDb) =>
          updateVault(transactionDb, vaultId, { default_currency: currency, updated_at: now }),
      });
      setDefaultCurrency(currency);
      onVaultChange?.(await refreshVaultStore(db, vaultId));
      setNotice(`Default currency changed to ${currency}.`);
      setError(null);
    } catch (cause) {
      console.error('Currency preference update failed', cause);
      setError('The default currency could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = categoryForm.name.trim();
    if (!name) {
      setError('Enter a category name.');
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'category',
        entityId: id,
        operation: 'create',
        changedFields: ['name', 'kind', 'position'],
        payload: {
          entity: 'category',
          value: {
            id,
            vault_id: vaultId,
            name,
            slug: categorySlug(name),
            kind: categoryForm.kind,
            color_token: 'stone',
            icon_name: 'tag',
            position: categories.length,
            is_active: true,
            created_at: now,
            updated_at: now,
            version: 1,
          },
        },
        apply: (transactionDb) =>
          insertCategory(transactionDb, {
            id,
            vault_id: vaultId,
            name,
            slug: categorySlug(name),
            kind: categoryForm.kind,
            color_token: 'stone',
            icon_name: 'tag',
            position: categories.length,
            is_active: true,
            created_at: now,
            updated_at: now,
            version: 1,
          }),
      });
      setCategoryForm(emptyCategoryForm);
      setNotice(`Category “${name}” added.`);
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Category create failed', cause);
      setError('That category could not be added. Names must be unique within this vault.');
    }
  };

  const saveCategoryName = async (category: Category) => {
    const name = editingName.trim();
    if (!name) {
      setError('Category name cannot be blank.');
      return;
    }
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'category',
        entityId: category.id,
        operation: 'update',
        changedFields: ['name', 'slug'],
        baseVersion: category.version,
        payload: {
          entity: 'category',
          value: {
            id: category.id,
            vault_id: vaultId,
            name,
            slug: categorySlug(name),
            updated_at: now,
          },
        },
        apply: (transactionDb) =>
          updateCategory(transactionDb, vaultId, category.id, {
            name,
            slug: categorySlug(name),
            updated_at: now,
          }),
      });
      setEditingCategory(null);
      setNotice('Category renamed. Historical transactions keep their category link.');
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Category rename failed', cause);
      setError('That category could not be renamed. Names must be unique within this vault.');
    }
  };

  const moveCategory = async (category: Category, direction: -1 | 1) => {
    const index = categories.findIndex((candidate) => candidate.id === category.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= categories.length) return;
    const ordered = categories.map((candidate) => candidate.id);
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex]!, ordered[index]!];
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'category',
        entityId: category.id,
        operation: 'update',
        changedFields: ['position'],
        baseVersion: category.version,
        payload: {
          entity: 'category',
          value: { id: category.id, vault_id: vaultId, position: nextIndex, updated_at: now },
        },
        apply: (transactionDb) => reorderCategories(transactionDb, vaultId, ordered, now),
      });
      setNotice('Category order updated.');
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Category reorder failed', cause);
      setError('The category order could not be updated.');
    }
  };

  const toggleCategory = async (category: Category) => {
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'category',
        entityId: category.id,
        operation: 'update',
        changedFields: ['is_active'],
        baseVersion: category.version,
        payload: {
          entity: 'category',
          value: {
            id: category.id,
            vault_id: vaultId,
            is_active: !category.is_active,
            updated_at: now,
          },
        },
        apply: (transactionDb) =>
          updateCategoryActive(transactionDb, vaultId, category.id, !category.is_active, now),
      });
      setNotice(
        category.is_active
          ? 'Category archived. Existing transactions remain intact.'
          : 'Category restored.',
      );
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Category status change failed', cause);
      setError(cause instanceof Error ? cause.message : 'That category could not be updated.');
    }
  };

  const mergeSelectedCategory = async () => {
    if (!mergeSourceId || !mergeTargetId) {
      setError('Choose both a category to merge and an active target.');
      return;
    }
    const source = categories.find((category) => category.id === mergeSourceId);
    const target = categories.find((category) => category.id === mergeTargetId);
    if (!source || !target) return;
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'category',
        entityId: source.id,
        operation: 'merge',
        baseVersion: source.version,
        changedFields: ['category_id', 'is_active'],
        payload: {
          entity: 'category',
          value: {
            id: source.id,
            vault_id: vaultId,
            target_category_id: target.id,
            is_active: false,
            updated_at: now,
          },
        },
        apply: (transactionDb) => mergeCategory(transactionDb, vaultId, source.id, target.id, now),
      });
      setMergeSourceId('');
      setMergeTargetId('');
      setNotice(`Merged “${source.name}” into “${target.name}”.`);
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Category merge failed', cause);
      setError('Those categories could not be merged.');
    }
  };

  const addRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matcher = categorySlug(ruleMatcher).replaceAll('-', ' ');
    if (!matcher || !ruleCategoryId) {
      setError('Enter a merchant pattern and choose a category.');
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'categorization_rule',
        entityId: id,
        operation: 'create',
        changedFields: ['matcher', 'category_id', 'is_active'],
        payload: {
          entity: 'categorization_rule',
          value: {
            id,
            vault_id: vaultId,
            category_id: ruleCategoryId,
            rule_type: 'personal_merchant',
            matcher,
            priority: 10,
            confidence: 1,
            evidence_count: 1,
            is_active: true,
            created_from: 'explicit_user_rule',
            created_at: now,
            updated_at: now,
            version: 1,
          },
        },
        apply: (transactionDb) =>
          insertRule(transactionDb, {
            id,
            vault_id: vaultId,
            category_id: ruleCategoryId,
            rule_type: 'personal_merchant',
            matcher,
            priority: 10,
            confidence: 1,
            evidence_count: 1,
            is_active: true,
            created_from: 'explicit_user_rule',
            created_at: now,
            updated_at: now,
            version: 1,
          }),
      });
      setRuleMatcher('');
      setNotice(`Personal rule saved for “${matcher}”.`);
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Rule create failed', cause);
      setError('That personal rule could not be saved.');
    }
  };

  const saveRule = async (rule: CategorizationRule) => {
    const matcher = categorySlug(editingRuleMatcher).replaceAll('-', ' ');
    if (!matcher || !editingRuleCategoryId) {
      setError('Enter a merchant pattern and choose a category.');
      return;
    }
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'categorization_rule',
        entityId: rule.id,
        operation: 'update',
        baseVersion: rule.version,
        changedFields: ['matcher', 'category_id'],
        payload: {
          entity: 'categorization_rule',
          value: {
            id: rule.id,
            vault_id: vaultId,
            matcher,
            category_id: editingRuleCategoryId,
            updated_at: now,
          },
        },
        apply: (transactionDb) =>
          updateRule(transactionDb, vaultId, rule.id, {
            matcher,
            category_id: editingRuleCategoryId,
            updated_at: now,
          }),
      });
      setEditingRuleId(null);
      setNotice('Personal rule updated.');
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Rule update failed', cause);
      setError('That personal rule could not be updated.');
    }
  };

  const removeRule = async (rule: CategorizationRule) => {
    if (
      !window.confirm(
        `Remove the rule for “${rule.matcher}”? Existing transactions will not change.`,
      )
    )
      return;
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'categorization_rule',
        entityId: rule.id,
        operation: 'update',
        baseVersion: rule.version,
        changedFields: ['is_active'],
        payload: {
          entity: 'categorization_rule',
          value: { id: rule.id, vault_id: vaultId, is_active: false, updated_at: now },
        },
        apply: (transactionDb) =>
          updateRule(transactionDb, vaultId, rule.id, { is_active: false, updated_at: now }),
      });
      setUndoRule(rule);
      setNotice('Personal rule removed. Use Undo to restore it.');
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Rule removal failed', cause);
      setError('That personal rule could not be removed.');
    }
  };

  const undoRuleRemoval = async () => {
    if (!undoRule) return;
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'categorization_rule',
        entityId: undoRule.id,
        operation: 'update',
        baseVersion: undoRule.version,
        changedFields: ['is_active'],
        payload: {
          entity: 'categorization_rule',
          value: { id: undoRule.id, vault_id: vaultId, is_active: true, updated_at: now },
        },
        apply: (transactionDb) =>
          updateRule(transactionDb, vaultId, undoRule.id, { is_active: true, updated_at: now }),
      });
      setUndoRule(null);
      setNotice('Personal rule restored.');
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Rule undo failed', cause);
      setError('The removed rule could not be restored.');
    }
  };

  const toggleRule = async (rule: CategorizationRule) => {
    const now = new Date().toISOString();
    try {
      await runMutation({
        entityType: 'categorization_rule',
        entityId: rule.id,
        operation: 'update',
        changedFields: ['is_active'],
        baseVersion: rule.version,
        payload: {
          entity: 'categorization_rule',
          value: { id: rule.id, vault_id: vaultId, is_active: !rule.is_active, updated_at: now },
        },
        apply: (transactionDb) =>
          updateRule(transactionDb, vaultId, rule.id, {
            is_active: !rule.is_active,
            updated_at: now,
          }),
      });
      setNotice(
        rule.is_active ? 'Personal rule disabled for future imports.' : 'Personal rule enabled.',
      );
      setError(null);
      await refresh();
    } catch (cause) {
      console.error('Rule status change failed', cause);
      setError('That personal rule could not be updated.');
    }
  };

  const categoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? 'Archived category';

  const createVault = async (demoMode: boolean) => {
    try {
      const created = await createLocalVault(db, {
        label: vaultLabel.trim() || (demoMode ? 'Portfolio demo' : ''),
        demoMode,
      });
      const next = await refreshVaultStore(db, created.id);
      onVaultChange?.(next);
      setVaultLabel('');
      setNotice(
        demoMode ? 'A clearly labeled demo vault was created.' : 'A new private vault was created.',
      );
      setError(null);
    } catch (cause) {
      console.error('Vault creation failed', cause);
      setError(cause instanceof Error ? cause.message : 'The new vault could not be created.');
    }
  };

  const openExportDialog = () => {
    if (
      pendingSyncCount > 0 &&
      !window.confirm(
        `This vault has ${pendingSyncCount} pending synchronization change${pendingSyncCount === 1 ? '' : 's'} that will not be included in a portable backup. Export anyway?`,
      )
    )
      return;
    setPassword('');
    setPasswordConfirmation('');
    setPasswordAction({ kind: 'export' });
    setError(null);
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordAction) return;
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (passwordAction.kind === 'export' && password !== passwordConfirmation) {
      setError('The export passwords did not match. No backup was created.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (passwordAction.kind === 'export') {
        const blob = await exportVault(db, vaultId, password);
        downloadVaultExport(blob);
        setNotice(
          'Encrypted vault backup downloaded. Store the password separately; it cannot be recovered here.',
        );
      } else {
        const snapshot = await parseVaultExport(passwordAction.file, password);
        setImportCandidate({ fileName: passwordAction.file.name, snapshot });
        setNotice('Backup verified. Review the replacement details before applying it.');
      }
      setPasswordAction(null);
      setPassword('');
      setPasswordConfirmation('');
    } catch (cause) {
      console.error('Vault backup operation failed', cause);
      setError(cause instanceof Error ? cause.message : 'The vault backup could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setPassword('');
    setPasswordConfirmation('');
    setPasswordAction({ kind: 'import', file });
    setError(null);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const applyImport = async () => {
    if (!importCandidate) return;
    const copyLabel = window.prompt(
      'Name the new isolated vault copy.',
      `${importCandidate.snapshot.vault.vault_owner_label ?? 'Imported vault'} copy`,
    );
    if (copyLabel === null) return;
    if (
      !window.confirm(
        'Create a new isolated vault from this backup? Existing vaults and records will remain untouched.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const newVaultId = await importAsNewVault(db, importCandidate.snapshot, copyLabel);
      const next = await refreshVaultStore(db, newVaultId);
      onVaultChange?.(next);
      setImportCandidate(null);
      setNotice(
        `Created “${next.vault.vault_owner_label ?? 'Imported vault'}” without changing the source vault.`,
      );
    } catch (cause) {
      console.error('Vault copy import failed', cause);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The verified backup could not be copied into a new vault.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteStatementOriginals = async () => {
    if (
      !window.confirm(
        'Delete retained statement originals and encrypted row payloads? Normalized transactions, import history, and personal rules will remain.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const mutationCiphertext = await encryptMutationPayload(
        { action: 'delete_statement_originals' },
        `${vaultId}:privacy:statement-originals`,
      );
      await deleteStatementOriginals(db, {
        vaultId,
        now: new Date().toISOString(),
        mutationDeviceId: 'web',
        mutationCiphertext,
      });
      setNotice('Statement originals deleted. Normalized records and personal rules remain.');
      await refresh();
    } catch (cause) {
      console.error('Statement-original deletion failed', cause);
      setError('Statement originals could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteImportedRecords = async () => {
    if (!selectedImportId) {
      setError('Choose an imported statement first.');
      return;
    }
    const selected = statementImports.find((statement) => statement.id === selectedImportId);
    if (
      !selected ||
      !window.confirm(
        `Delete the normalized records imported from “${selected.file_name}”? Personal rules will remain available for future imports.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const mutationCiphertext = await encryptMutationPayload(
        { action: 'delete_imported_records', import_id: selected.id },
        `${vaultId}:privacy:${selected.id}`,
      );
      const result = await deleteImportedRecords(db, {
        vaultId,
        importId: selected.id,
        now: new Date().toISOString(),
        mutationDeviceId: 'web',
        mutationCiphertext,
      });
      setNotice(
        `Deleted ${result.deletedTransactions} imported transaction${result.deletedTransactions === 1 ? '' : 's'}; learned rules were kept.`,
      );
      setSelectedImportId('');
      await refresh();
    } catch (cause) {
      console.error('Imported-record deletion failed', cause);
      setError('Imported records could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteActiveVault = async () => {
    if (
      !window.confirm(
        'Permanently delete this active vault and all of its local records? Export a backup first. This does not remove copies on other devices.',
      )
    )
      return;
    if (
      !window.confirm(
        'I understand this removes the active vault only from this browser, including unsynchronized changes, and cannot be undone.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await deleteVaultLocally(db, vaultId);
      window.location.reload();
    } catch (cause) {
      console.error('Active-vault deletion failed', cause);
      setError(cause instanceof Error ? cause.message : 'The active vault could not be deleted.');
      setBusy(false);
    }
  };

  const handleClearLocalData = async () => {
    if (
      !window.confirm(
        'Delete every local vault, transaction, import, rule, and encryption key from this browser? Export a backup first if you may need the data.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await clearLocalData(db);
      window.location.reload();
    } catch (cause) {
      console.error('Clear local data failed', cause);
      setError(
        cause instanceof Error
          ? cause.message
          : 'Local data could not be cleared. Close other app tabs and try again.',
      );
      // The active connection was closed before IndexedDB deletion. Do not leave
      // the mounted app issuing queries against that dead session.
      window.setTimeout(() => window.location.reload(), 0);
    }
  };

  return (
    <section className="page" aria-labelledby="settings-heading">
      <header className="page__header">
        <h1 id="settings-heading">Privacy and settings</h1>
        <p className="page__subtitle">
          Shape your private vocabulary and the rules that make future imports feel more like yours.
        </p>
      </header>

      {notice && (
        <p className="notice notice--success" role="status">
          {notice}
          {undoRule && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void undoRuleRemoval()}
            >
              Undo
            </button>
          )}
        </p>
      )}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="notice" role="status">
          Working locally…
        </p>
      )}

      <div className="page__body">
        <section className="panel" aria-labelledby="local-vault-heading">
          <h2 id="local-vault-heading">Your data stays on this device</h2>
          <p>
            Statements are parsed in this browser and saved to its local SQLite vault. No account,
            cloud database, or subscription is required for local entry, imports, history, or
            summaries.
          </p>
          <p>
            Category corrections and personal rules are also vault-scoped. They influence future
            imports here, not anyone else’s data.
          </p>
          <form
            className="settings-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createVault(false);
            }}
          >
            <label>
              New vault name{' '}
              <input
                value={vaultLabel}
                onChange={(event) => setVaultLabel(event.target.value)}
                placeholder="e.g. Household demo"
              />
            </label>
            <button type="submit" className="button button--secondary">
              Create private vault
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void createVault(true)}
            >
              Create demo vault
            </button>
          </form>
        </section>

        <section className="panel" aria-labelledby="currency-heading">
          <h2 id="currency-heading">Default currency</h2>
          <p>
            New manual entries and imports without a currency use this choice. Existing records
            keep their original currency.
          </p>
          <label>
            Currency{' '}
            <select
              aria-label="Default currency"
              value={defaultCurrency}
              onChange={(event) => void saveDefaultCurrency(event.target.value)}
              disabled={busy}
            >
              {ISO_CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} · {CURRENCY_DISPLAY[code].symbol}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel" aria-labelledby="category-management-heading">
          <div className="section-heading">
            <div>
              <h2 id="category-management-heading">Categories</h2>
            </div>
            <span className="section-heading__meta">
              {categories.filter((category) => category.is_active).length} active
            </span>
          </div>
          <form className="settings-inline-form" onSubmit={(event) => void addCategory(event)}>
            <label>
              New category{' '}
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                placeholder="e.g. Pet care"
              />
            </label>
            <label>
              Kind{' '}
              <select
                value={categoryForm.kind}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, kind: event.target.value as CategoryKind })
                }
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button type="submit" className="button button--primary">
              Add category
            </button>
          </form>
          <div className="settings-list" aria-label="Categories">
            {categories.map((category) => (
              <div
                className={`settings-list__row${category.is_active ? '' : ' settings-list__row--muted'}`}
                key={category.id}
              >
                <div>
                  {editingCategory === category.id ? (
                    <input
                      aria-label={`Rename ${category.name}`}
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                  ) : (
                    <strong>{category.name}</strong>
                  )}
                  <small>
                    {category.kind} · {category.is_active ? 'active' : 'archived'}
                  </small>
                </div>
                <div className="settings-list__actions">
                  {editingCategory === category.id ? (
                    <>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => void saveCategoryName(category)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => setEditingCategory(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => {
                        setEditingCategory(category.id);
                        setEditingName(category.name);
                      }}
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void moveCategory(category, -1)}
                    disabled={category.position === 0}
                    aria-label={`Move ${category.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void moveCategory(category, 1)}
                    disabled={category.position === categories.length - 1}
                    aria-label={`Move ${category.name} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void toggleCategory(category)}
                  >
                    {category.is_active ? 'Archive' : 'Restore'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="form-hint">
            Archiving never orphans historical transactions. At least one active category must
            remain available.
          </p>
          <div className="settings-inline-form settings-inline-form--merge">
            <label>
              Merge category{' '}
              <select
                value={mergeSourceId}
                onChange={(event) => setMergeSourceId(event.target.value)}
              >
                <option value="">Choose source</option>
                {categories
                  .filter((category) => category.is_active)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Into active category{' '}
              <select
                value={mergeTargetId}
                onChange={(event) => setMergeTargetId(event.target.value)}
              >
                <option value="">Choose target</option>
                {categories
                  .filter((category) => category.is_active && category.id !== mergeSourceId)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void mergeSelectedCategory()}
            >
              Merge
            </button>
          </div>
        </section>

        <section className="panel" aria-labelledby="rules-heading">
          <div className="section-heading">
            <div>
              <h2 id="rules-heading">Personal merchant rules</h2>
            </div>
            <span className="section-heading__meta">
              {rules.filter((rule) => rule.is_active).length} enabled
            </span>
          </div>
          <p>
            Rules outrank generic defaults during future imports. Disable a rule when a merchant’s
            context changes; already confirmed history is not rewritten automatically.
          </p>
          <form className="settings-inline-form" onSubmit={(event) => void addRule(event)}>
            <label>
              Merchant pattern{' '}
              <input
                value={ruleMatcher}
                onChange={(event) => setRuleMatcher(event.target.value)}
                placeholder="e.g. neighborhood cafe"
              />
            </label>
            <label>
              Apply category{' '}
              <select
                value={ruleCategoryId}
                onChange={(event) => setRuleCategoryId(event.target.value)}
              >
                {categories
                  .filter((category) => category.is_active)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" className="button button--primary">
              Save rule
            </button>
          </form>
          <div className="settings-list" aria-label="Personal categorization rules">
            {rules.length === 0 ? (
              <p className="form-hint">
                No personal rules yet. Save one after a correction you want future imports to
                remember.
              </p>
            ) : (
              rules.map((rule) => (
                <div
                  className={`settings-list__row${rule.is_active ? '' : ' settings-list__row--muted'}`}
                  key={rule.id}
                >
                  {editingRuleId === rule.id ? (
                    <div className="settings-inline-form settings-inline-form--rule-edit">
                      <label>
                        Pattern{' '}
                        <input
                          value={editingRuleMatcher}
                          onChange={(event) => setEditingRuleMatcher(event.target.value)}
                        />
                      </label>
                      <label>
                        Category{' '}
                        <select
                          value={editingRuleCategoryId}
                          onChange={(event) => setEditingRuleCategoryId(event.target.value)}
                        >
                          {categories
                            .filter((category) => category.is_active)
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="settings-list__actions">
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => void saveRule(rule)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => setEditingRuleId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>{rule.matcher}</strong>
                        <small>
                          {categoryName(rule.category_id)} ·{' '}
                          {rule.is_active ? 'enabled' : 'disabled'} ·{' '}
                          {CATEGORY_SOURCE_LABELS.personal_rule}
                        </small>
                      </div>
                      <div className="settings-list__actions">
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => {
                            setEditingRuleId(rule.id);
                            setEditingRuleMatcher(rule.matcher);
                            setEditingRuleCategoryId(rule.category_id);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => void toggleRule(rule)}
                        >
                          {rule.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="button button--ghost button--danger"
                          onClick={() => void removeRule(rule)}
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="backup-heading">
          <h2 id="backup-heading">Export or restore this vault</h2>
          <p>
            Backups are encrypted in this browser with a password you choose. The export contains
            normalized local records and stays on your device until you explicitly download or
            select it. Pending sync mutations and device pairings are not portable and are
            intentionally left behind.
          </p>
          {pendingSyncCount > 0 && (
            <p className="notice notice--warning">
              {pendingSyncCount} pending synchronization change{pendingSyncCount === 1 ? '' : 's'}{' '}
              will not travel with this backup.
            </p>
          )}
          <div className="page-header__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={openExportDialog}
              disabled={busy}
            >
              Export encrypted backup
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
            >
              Inspect backup
            </button>
            <input
              ref={importInputRef}
              className="sr-only"
              type="file"
              accept=".etvault,application/json"
              aria-label="Choose an encrypted vault backup"
              onChange={(event) => void handleImportFile(event.target.files?.[0])}
            />
          </div>
          <p className="form-hint">
            Importing creates a new isolated vault copy after confirmation. Existing vaults,
            records, and the source backup remain untouched.
          </p>
          {passwordAction && (
            <form
              className="notice notice--warning backup-password"
              role="dialog"
              aria-labelledby="backup-password-heading"
              onSubmit={(event) => void submitPassword(event)}
            >
              <h3 id="backup-password-heading">
                {passwordAction.kind === 'export' ? 'Protect your backup' : 'Unlock this backup'}
              </h3>
              <p>
                {passwordAction.kind === 'export'
                  ? 'Choose a password you can store safely. It cannot be recovered by this app.'
                  : `Enter the password for “${passwordAction.file.name}”.`}
              </p>
              <label>
                Password{' '}
                <input
                  autoFocus
                  required
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {passwordAction.kind === 'export' && (
                <label>
                  Confirm password{' '}
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              )}
              <div className="page-header__actions">
                <button type="submit" className="button button--primary" disabled={busy}>
                  {passwordAction.kind === 'export' ? 'Create encrypted backup' : 'Unlock backup'}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setPasswordAction(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {importCandidate && (
            <div
              className="notice notice--warning"
              role="dialog"
              aria-modal="false"
              aria-labelledby="backup-preview-heading"
            >
              <strong id="backup-preview-heading">
                Ready to restore “{importCandidate.fileName}”
              </strong>
              <p>
                This backup contains vault “
                {String(
                  importCandidate.snapshot.vault.vault_owner_label ??
                    importCandidate.snapshot.vault.id,
                )}
                ”, {importCandidate.snapshot.tables.transactions.length} transactions,{' '}
                {importCandidate.snapshot.tables.categories.length} categories, and{' '}
                {importCandidate.snapshot.tables.categorization_rules.length} personal rules.
              </p>
              <div className="page-header__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void applyImport()}
                  disabled={busy}
                >
                  Create isolated vault copy
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setImportCandidate(null)}
                  disabled={busy}
                >
                  Cancel restore
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="retention-heading">
          <h2 id="retention-heading">Remove imported data</h2>
          <p>
            Statement originals are optional and can be removed without changing normalized history.
            Deleting an imported statement tombstones its transactions and removes its review
            metadata; learned personal rules remain independent and are not deleted automatically.
          </p>
          <div className="settings-inline-form">
            <label>
              Imported statement{' '}
              <select
                value={selectedImportId}
                onChange={(event) => setSelectedImportId(event.target.value)}
                disabled={busy}
              >
                <option value="">Choose a statement</option>
                {statementImports.map((statement) => (
                  <option key={statement.id} value={statement.id}>
                    {statement.file_name} · {statement.status}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void handleDeleteImportedRecords()}
              disabled={busy || !selectedImportId}
            >
              Delete imported records
            </button>
            <button
              type="button"
              className="button button--ghost button--danger"
              onClick={() => void handleDeleteStatementOriginals()}
              disabled={busy}
            >
              Delete statement originals
            </button>
          </div>
        </section>

        <section className="panel panel--error" aria-labelledby="danger-zone-heading">
          <h2 id="danger-zone-heading">Clear this browser</h2>
          <p>
            Delete every local vault, statement import, transaction, rule, pairing record, and
            browser encryption key. This is permanent for this browser profile, and the app will
            reload after success.
          </p>
          <div className="page-header__actions">
            <button
              type="button"
              className="button button--ghost button--danger"
              onClick={() => void handleDeleteActiveVault()}
              disabled={busy}
            >
              Delete active vault
            </button>
            <button
              type="button"
              className="button button--ghost button--danger"
              onClick={() => void handleClearLocalData()}
              disabled={busy}
            >
              Delete all local data
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
