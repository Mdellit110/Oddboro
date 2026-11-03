<script lang="ts">
  import DocEditor from './DocEditor.svelte';
  import { call } from './api.ts';
  import type { FileRef } from './windows.svelte.ts';

  // One staffer's file in the document editor. The viewer window wraps it,
  // and an attachment on the desk shows it inline.
  type Props = {
    file: FileRef;
    mode?: 'view' | 'edit';
    /** Sized to sit inside a task step rather than fill a window. */
    inline?: boolean;
    ondirty?: (dirty: boolean) => void;
    onsaved?: () => void;
  };
  let { file, mode = $bindable('view'), inline = false, ondirty, onsaved }: Props = $props();

  type Loaded = { staff: string; path: string; content: string; mtime: number };
  let loaded = $state<Loaded | undefined>();
  let problem = $state('');
  let doc: DocEditor | undefined = $state();

  $effect(() => {
    const f = file;
    loaded = undefined;
    problem = '';
    call<Loaded>(
      `/api/files?staff=${encodeURIComponent(f.staff)}&path=${encodeURIComponent(f.path)}`
    )
      .then((r) => (loaded = r))
      .catch((e: unknown) => (problem = e instanceof Error ? e.message : String(e)));
  });

  /** The save the viewer's close bar asks for. */
  export const save = async (): Promise<boolean> => (await doc?.save()) ?? false;

  async function write(draft: string): Promise<string> {
    if (!loaded) throw new Error('The file is still opening');
    loaded = await call<Loaded>(
      '/api/files',
      { staff: loaded.staff, path: loaded.path, content: draft, mtime: loaded.mtime },
      'PUT'
    );
    onsaved?.();
    return loaded.content;
  }

  const name = $derived(file.path.split('/').pop() ?? file.path);
</script>

{#if loaded}
  <DocEditor
    bind:this={doc}
    text={loaded.content}
    {name}
    markdown={/\.md$/i.test(file.path)}
    staff={file.staff}
    bind:mode
    {inline}
    {ondirty}
    onsave={write}
  />
{:else if problem}
  <p class="m-3 rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
{:else}
  <p class="py-8 text-center text-sm text-muted">Opening</p>
{/if}
