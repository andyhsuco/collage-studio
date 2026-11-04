/** Public read shape. edit_token is intentionally absent. */
export function toPublicCollage(
  row: {
    id: string;
    doc: unknown;
    title: string | null;
    source: string;
    created_at: string;
    updated_at: string;
  },
  canEdit: boolean,
) {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    doc: row.doc,
    canEdit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCreatedCollage(row: {
  id: string;
  editToken: string;
  title: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: row.id,
    editToken: row.editToken,
    title: row.title,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
