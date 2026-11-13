# Markdown

Authority: CommonMark + GFM + directive extensions + callout conventions. unified/remark parses source; Milkdown/ProseMirror edits rendered content. Custom marks serialize as :underline[text], :mark[text]{color="yellow"}, :color[text]{value="#C24B52"}. Fold containers use :::fold[Title]{default="closed"}. Callouts remain blockquotes beginning with [!NOTE]/[!WARNING]. CodeMirror is restricted to Crepe code blocks because its LaTeX feature requires that component; it is not the main editor.

Unknown block directives are opaque, read-only AST nodes; tests prove that editing a different paragraph preserves the original directive source slice. Raw HTML/body frontmatter is conservatively read-only and never passed to a raw HTML renderer. Unknown inline/nested extensions need broader qualification before release.

SourceDocument retains the raw input and parser-provided ranges. Peek reads an exact slice of that source, not a reserialized ProseMirror node. No-op serialization preserves the full input; ordinary edits preserve unchanged top-level source slices and serialize only changed semantics. Editing the peek replaces the selected block through an ordinary ProseMirror transaction; a browser test verifies timer cancellation and undo continuity. Heading folding and complete nested-block identity behavior are also pending.

Fixtures cover Chinese, French/English, emoji/combining marks, CRLF/LF, math, tables, nested/task lists, callouts, known/unknown directives, HTML, frontmatter, whitespace and code. They do not imply every syntax has been verified on native IMEs.
