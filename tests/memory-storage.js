// Storage en memoria con la misma API que `js/storage.js`, para pruebas.

const clone = (x) => (x === null || x === undefined ? x : JSON.parse(JSON.stringify(x)));

export function createMemoryStorage({ lists = [], items = [], meta = null, failOpen = false } = {}) {
  const L = new Map(lists.map((l) => [l.id, clone(l)]));
  const I = new Map(items.map((i) => [i.id, clone(i)]));
  let M = clone(meta);

  return {
    async open() { if (failOpen) throw new Error('no se puede abrir'); },
    close() {},
    async loadAll() { return { lists: [...L.values()].map(clone), items: [...I.values()].map(clone) }; },
    async putList(l) { L.set(l.id, clone(l)); },
    async putItem(i) { I.set(i.id, clone(i)); },
    async deleteItem(id) { I.delete(id); },
    async deleteItems(ids) { for (const id of ids) I.delete(id); },
    async deleteListCascade(id) {
      L.delete(id);
      for (const [k, i] of I) if (i.listId === id) I.delete(k);
    },
    async putRecords(ls = [], is = []) {
      for (const l of ls) L.set(l.id, clone(l));
      for (const i of is) I.set(i.id, clone(i));
    },
    async deleteRecords(lids = [], iids = []) {
      for (const id of lids) L.delete(id);
      for (const id of iids) I.delete(id);
    },
    async clearAll() { L.clear(); I.clear(); },
    async getMeta() { return clone(M); },
    async setMeta(m) { M = clone({ ...m, key: 'sync' }); },
    async deleteMeta() { M = null; },
    async requestPersistence() { return true; },
    // Ayudas de inspección para las pruebas
    snapshot: () => ({ lists: [...L.values()].map(clone), items: [...I.values()].map(clone), meta: clone(M) }),
  };
}
