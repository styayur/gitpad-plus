// SPDX-License-Identifier: AGPL-3.0-only
import { definePlugin } from '../../packages/sdk/index';
export default definePlugin({
  manifest: {id: 'official-toolbar', name: 'Formatting toolbar', version: '0.1.0-alpha.1', apiVersion: 1, level: 1, permissions: ['commands', 'editor']},
  activate(api) {
    for (const [id, title] of [['bullet', 'List'], ['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underline'], ['strike', 'Strike'], ['mark', 'Highlight'], ['color', 'Color'], ['link', 'Link'], ['fold', 'Fold'], ['expandAll', 'Expand all'], ['collapseAll', 'Collapse all']])
      api.registerCommand({id, title, toolbar: true, run: () => api.editorCommand(id)});
  },
});
