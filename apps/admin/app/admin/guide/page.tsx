import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'
import { TABLE_FRAME, THead, Table, TableRegion, Td, Th, Tr } from '@/components/ui/Table'
import { DATA_TABLE_MAP, type DataTableConfig, type DataTableColumnConfig } from '@/lib/dataTables'
import { exportColumnNames } from '@/lib/dataTables/serialization'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<DataTableColumnConfig['type'], string> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  boolean: 'true / false',
  json: 'JSON array',
}

// Domain groups — mirror the sidebar's DATA sections.
const GROUPS: { title: string; blurb: string; tables: string[] }[] = [
  {
    title: 'Courses & Careers',
    blurb: 'Feeds the Lists → Courses tab, the Career destinations/countries screens, and the AI-generated career insights shown in the app.',
    tables: ['career_courses', 'career_facts', 'ai_career_impact', 'career_destinations', 'career_countries', 'career_programs', 'course_taxonomy_map'],
  },
  {
    title: 'Universities & Rankings',
    blurb: 'Feeds the Lists → Universities directory, school detail pages, and the “top schools by course” rankings.',
    tables: ['tertiary_schools', 'university_profiles', 'course_school_rankings', 'course_school_quality', 'bar_results'],
  },
  {
    title: 'Exams & Knowledge',
    blurb: 'Feeds the UPCAT mock exam (passages → blueprint sections) and the exam facts / cutoffs shown on the Exams screen.',
    tables: ['upcat_cutoffs', 'upcat_facts', 'upcat_passages', 'exam_skill_categories', 'exam_blueprint_sections', 'exam_course_notes'],
  },
  {
    title: 'Operations',
    blurb: 'Feeds the in-app Admissions Updates feed.',
    tables: ['admissions_updates'],
  },
]

function colNote(col: DataTableColumnConfig, config: DataTableConfig): string {
  if (col.name === config.idColumn) return `Primary key (${config.idType})`
  if (col.type === 'json') return 'Array — in CSV put JSON (["a","b"]) or a;b;c'
  if (col.type === 'boolean') return 'true / false (blank = false)'
  return ''
}

function FormatTable({ config }: { config: DataTableConfig }) {
  const order = exportColumnNames(config)
  const byName = new Map(config.columns.map(c => [c.name, c]))
  return (
    <div className={TABLE_FRAME}>
    <TableRegion label={`${config.label} columns`}>
      <Table caption={`${config.label} columns`} density="compact" className="min-w-[520px]">
        <THead>
          <tr>
            {['Column', 'Type', 'Required', 'Notes'].map((h, i) => (
              <Th key={h} pin={i === 0 ? 'first' : undefined}>{h}</Th>
            ))}
          </tr>
        </THead>
        <tbody>
          {order.map(name => {
            const col = byName.get(name)
            const type = col?.type ?? 'text'
            const required = name === config.idColumn || !!col?.required
            return (
              <Tr key={name}>
                <Td pin="first" className="font-mono text-xs">{name}</Td>
                <Td className="text-ink-muted">{TYPE_LABEL[type]}</Td>
                <Td className="text-ink-muted">{required ? 'Yes' : <span className="sr-only">No</span>}</Td>
                <Td className="text-xs text-ink-muted">{col ? colNote(col, config) : ''}</Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </TableRegion>
    </div>
  )
}

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>

export default function GuidePage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="User Guide" />
      <PageBody
        width="narrow"
        intro={<>This console manages all the data the Iskotify mobile &amp; web apps read. Most data lives in the <B>Data</B> sections of the sidebar, each backed by the same editor with the same controls.</>}
      >
        <Card title="Working with Data tables">
          <ul className="space-y-2 text-ui text-ink-muted">
            <li><B>Add, edit, delete:</B> <B>Add row</B> opens an empty editor; click a row’s name or its pencil to edit it. Delete from the row’s trash icon or the editor’s <B>Delete</B> button.</li>
            <li><B>Search, sort and pages:</B> the search box filters by the table’s key columns, column headers sort, and long tables paginate 50 rows at a time. The view is kept in the address bar, so it survives a refresh and can be shared.</li>
            <li><B>Export:</B> the <B>CSV</B> (spreadsheet-friendly) and <B>JSON</B> (exact copy) buttons download <em>all</em> rows, not just the current page.</li>
            <li><B>Import:</B> <B>Import</B> accepts a CSV <em>or</em> JSON file and <B>upserts</B> on the id column — existing ids are updated, new ids are inserted. You’ll see a summary of new / updated / skipped rows.</li>
            <li><B>Changes reach the apps automatically</B> on the next sync (every edit/import stamps <code>updated_at</code>, which the app pulls incrementally). No deploy needed.</li>
          </ul>
        </Card>

        <Card title="Import / export formats">
          <ul className="list-disc list-inside space-y-1.5 text-ui text-ink-muted">
            <li><B>CSV</B> uses the same column headers shown in each table’s reference below. The easiest way to start is to export CSV, edit in a spreadsheet, then import the same file.</li>
            <li><B>Array columns</B> (type “JSON array”, e.g. <code>known_for_courses</code>) are written as JSON text inside one cell — <code>[&quot;Nursing&quot;,&quot;Biology&quot;]</code>. On import you can also use a simple <code>semicolon;separated;list</code>.</li>
            <li><B>Booleans</B> are <code>true</code> / <code>false</code> (a blank cell counts as false).</li>
            <li><B>The id column is required</B> on every imported row (it’s how upsert matches). For tables with a generated id, leave it blank to create new rows.</li>
            <li><B>JSON import</B> expects an array of row objects (or <code>{`{ "rows": [...] }`}</code>) with the same keys.</li>
          </ul>
        </Card>

        <Card title="Specialized editors">
          <ul className="list-disc list-inside space-y-1.5 text-ui text-ink-muted">
            <li><B>UPCAT question bank</B> (Knowledge base → Import CSV): use the authoring sheet with <code>option_a…option_d</code> + a letter <code>answer</code>. This is different from a raw table export — don’t mix the two shapes.</li>
            <li><B>Flashcards, Exam Blueprints, Listings</B> have their own purpose-built editors in the sidebar; their underlying tables are not in the generic Data sections.</li>
            <li><B>Passages vs. questions:</B> reading passages live in <code>upcat_passages</code> (a Data table). The questions that reference them are managed by the UPCAT importer.</li>
          </ul>
        </Card>

        {/* Per-domain table references */}
        {GROUPS.map(group => (
          <Card key={group.title} title={group.title} description={group.blurb}>
            <div className="space-y-6">
              {group.tables.map(table => {
                const config = DATA_TABLE_MAP[table]
                if (!config) return null
                return (
                  <div key={table} id={table} className="scroll-mt-16 space-y-2">
                    <h3 className="text-sm font-semibold text-ink">
                      {config.label} <span className="font-mono text-xs font-normal text-ink-muted">({table})</span>
                    </h3>
                    {config.helpText && <p className="text-ui text-ink-muted">{config.helpText}</p>}
                    <FormatTable config={config} />
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
      </PageBody>
    </div>
  )
}
