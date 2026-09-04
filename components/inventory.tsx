"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  History,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product, Movement, Snapshot } from "@/lib/ministock/types";
import { CATEGORIES, stockStatus } from "@/lib/ministock/domain";
import { inventoryCsv } from "@/lib/ministock/export";

const num = (v: number) => v.toLocaleString("tr-TR");
const date = (v: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
async function api<T>(path: string, payload?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(path, {
      method: payload === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        payload === undefined
          ? {}
          : { "Content-Type": "application/json", "X-MiniStock-Request": "1" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await res.json();
    if (!res.ok)
      throw new Error(result.error?.message ?? "İşlem tamamlanamadı.");
    return result as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(
        "Yanıt gecikti. Aynı bilgileri koruyarak tekrar dene; işlem iki kez uygulanmaz.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function Status({ product }: { product: Product }) {
  const s = stockStatus(product.stock, product.reorderPoint);
  return (
    <span className={`badge ${s}`}>
      {s === "ok" ? <Check size={13} /> : <CircleAlert size={13} />}
      {{ ok: "Yeterli", low: "Düşük stok", zero: "Tükendi" }[s]}
    </span>
  );
}
function CategorySelect({
  value,
  onChange,
  id,
  all = false,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
  all?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="filter-select" aria-label="Kategori">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all && <SelectItem value="all">Tüm kategoriler</SelectItem>}
        {CATEGORIES.map((c) => (
          <SelectItem value={c} key={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function MovementList({
  movements,
  showProduct = false,
}: {
  movements: Movement[];
  showProduct?: boolean;
}) {
  return (
    <ul className="history-list">
      {movements.map((m) => (
        <li className="history-item" key={m.id}>
          <span className="history-icon">
            {m.delta > 0 ? (
              <ArrowDownLeft size={18} />
            ) : (
              <ArrowUpRight size={18} />
            )}
          </span>
          <div className="history-text">
            {showProduct && <strong>{m.productName}</strong>}
            <div className={`movement-direction ${m.delta > 0 ? "in" : "out"}`}>
              {m.delta > 0 ? "Stok girişi" : "Stok çıkışı"}
            </div>
            <p>{m.reason}</p>
            <time dateTime={m.createdAt}>{date(m.createdAt)}</time>
          </div>
          <span className="history-quantity">
            {m.delta > 0 ? "+" : ""}
            {num(m.delta)}
          </span>
        </li>
      ))}
    </ul>
  );
}
const emptyProduct = () => ({
  name: "",
  sku: "",
  category: "Elektronik",
  reorderPoint: "5",
  initialQuantity: "0",
});

export default function Inventory() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const bootstrap = useRef<Promise<Snapshot> | null>(null),
    refreshSequence = useRef(0);
  const [tab, setTab] = useState("inventory"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState("all"),
    [historyLimit, setHistoryLimit] = useState(20);
  const [productOpen, setProductOpen] = useState(false),
    [productForm, setProductForm] = useState(emptyProduct),
    [formError, setFormError] = useState("");
  const [movementProduct, setMovementProduct] = useState<Product | null>(null),
    [direction, setDirection] = useState<"in" | "out">("in"),
    [quantity, setQuantity] = useState("1"),
    [reason, setReason] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null),
    [detailLimit, setDetailLimit] = useState(20);
  const [saving, setSaving] = useState(false),
    savingRef = useRef(false),
    operation = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    bootstrap.current ??= api<Snapshot>("/api/workspace", {});
    bootstrap.current
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Çalışma alanı açılamadı.");
      });
    return () => {
      active = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setRefreshing(true);
    setError("");
    try {
      const next = await api<Snapshot>("/api/inventory");
      if (sequence === refreshSequence.current) setData(next);
    } catch (e) {
      if (sequence === refreshSequence.current)
        setError(e instanceof Error ? e.message : "Kayıtlar yenilenemedi.");
    } finally {
      if (sequence === refreshSequence.current) setRefreshing(false);
    }
  }, []);
  const retryInitial = async () => {
    setError("");
    setRefreshing(true);
    try {
      setData(await api<Snapshot>("/api/workspace", {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Çalışma alanı açılamadı.");
    } finally {
      setRefreshing(false);
    }
  };
  const products = data?.products ?? [],
    movements = data?.movements ?? [];
  const total = products.reduce((n, p) => n + p.stock, 0),
    low = products.filter((p) => p.stock <= p.reorderPoint).length,
    zero = products.filter((p) => p.stock === 0).length;
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return (data?.products ?? []).filter(
      (p) =>
        (!q || `${p.name} ${p.sku}`.toLocaleLowerCase("tr-TR").includes(q)) &&
        (category === "all" || p.category === category) &&
        (status === "all" ||
          (status === "low" && p.stock <= p.reorderPoint) ||
          (status === "zero" && p.stock === 0)),
    );
  }, [data, search, category, status]);
  const visibleIds = new Set(visible.map((p) => p.id));
  const visibleHistory = movements.filter((m) => visibleIds.has(m.productId));
  const detail = products.find((p) => p.id === detailId),
    detailHistory = movements.filter((m) => m.productId === detailId);
  const liveMovementProduct =
    products.find((p) => p.id === movementProduct?.id) ?? movementProduct;
  const quantityNumber = Number(quantity),
    expectedStock = liveMovementProduct
      ? liveMovementProduct.stock +
        (direction === "in" ? quantityNumber : -quantityNumber)
      : 0;
  const movementValid =
    quantity !== "" &&
    Number.isInteger(quantityNumber) &&
    quantityNumber > 0 &&
    quantityNumber <= 999999;
  const openProduct = () => {
    setProductForm(emptyProduct());
    setFormError("");
    operation.current = null;
    setProductOpen(true);
  };
  const openMovement = (p: Product, dir: "in" | "out") => {
    setMovementProduct(p);
    setDirection(dir);
    setQuantity("1");
    setReason("");
    setFormError("");
    operation.current = null;
  };
  const requestId = (fingerprint: string) => {
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    return operation.current.id;
  };
  const submitProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    const values = {
      ...productForm,
      reorderPoint: Number(productForm.reorderPoint),
      initialQuantity: Number(productForm.initialQuantity),
    };
    try {
      await api("/api/products", {
        ...values,
        requestId: requestId(JSON.stringify(values)),
      });
      setProductOpen(false);
      operation.current = null;
      toast.success("Ürün envantere eklendi.");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Ürün kaydedilemedi.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };
  const submitMovement = async (e: FormEvent) => {
    e.preventDefault();
    if (!movementProduct || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    const values = {
      productId: movementProduct.id,
      direction,
      quantity: Number(quantity),
      reason,
    };
    try {
      await api("/api/movements", {
        ...values,
        requestId: requestId(JSON.stringify(values)),
      });
      setMovementProduct(null);
      operation.current = null;
      toast.success(
        direction === "in"
          ? "Stok girişi kaydedildi."
          : "Stok çıkışı kaydedildi.",
      );
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Hareket kaydedilemedi.",
      );
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", inventoryCsv(visible)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ministock-envanter.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="app-wrap">
      <Toaster position="top-center" richColors />
      <a
        href="#inventory-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
      >
        Envantere geç
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Package size={25} />
          </span>
          MiniStock<small>Stok ve hareket takibi</small>
        </div>
        <span className="demo-label">Kişisel demo alanı</span>
      </header>
      <main className="workspace" id="inventory-content">
        <div className="heading">
          <div>
            <div className="eyebrow">ENVANTER / GENEL BAKIŞ</div>
            <h1>Stokların kontrol altında.</h1>
            <p>Neyin var, ne azaldı, ne zaman değişti?</p>
          </div>
          <div className="actions">
            <Button
              variant="outline"
              onClick={download}
              disabled={!data || visible.length === 0}
            >
              <Download />
              CSV indir
            </Button>
            <Button onClick={openProduct} disabled={!data}>
              <Plus />
              Ürün ekle
            </Button>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <Button
              variant="outline"
              onClick={data ? refresh : retryInitial}
              disabled={refreshing}
            >
              Tekrar dene
            </Button>
          </div>
        )}
        <section className="stats" aria-label="Stok özeti">
          {[
            {
              label: "Toplam ürün",
              value: products.length,
              icon: Package,
              style: "",
              hint: "Ürün çeşidi",
            },
            {
              label: "Toplam stok",
              value: total,
              icon: Boxes,
              style: "",
              hint: "Adet / set",
            },
            {
              label: "Düşük stok",
              value: low,
              icon: CircleAlert,
              style: "warning",
              hint: "Eşik ve altındaki ürünler",
            },
            {
              label: "Tükenen ürün",
              value: zero,
              icon: PackagePlus,
              style: "danger",
              hint: "Stoku sıfır olanlar",
            },
          ].map((s) => (
            <article className={`stat ${s.style}`} key={s.label}>
              <div className="stat-label">
                <s.icon size={17} />
                {s.label}
              </div>
              {data ? (
                <div className="stat-value">{num(s.value)}</div>
              ) : (
                <Skeleton className="mt-3 h-9 w-16" />
              )}
              <div className="status-note">{s.hint}</div>
            </article>
          ))}
        </section>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setHistoryLimit(20);
          }}
          className="board"
        >
          <div className="board-header">
            <TabsList variant="line" className="tab-strip">
              <TabsTrigger value="inventory">
                <Package size={17} />
                Ürünler <span className="count">{products.length}</span>
              </TabsTrigger>
              <TabsTrigger value="history">
                <History size={17} />
                Hareket geçmişi
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              onClick={refresh}
              disabled={!data || refreshing}
              aria-label="Kayıtları yenile"
            >
              <RefreshCw
                className={`refresh-icon ${refreshing ? "spin" : ""}`}
                size={17}
              />
              <span className="hide-mobile">Yenile</span>
            </Button>
          </div>
          <div className="toolbar">
            <div className="search">
              <Search size={18} />
              <input
                aria-label="Ürün adı veya koduyla ara"
                placeholder="Ürün adı veya koduyla ara…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHistoryLimit(20);
                }}
              />
            </div>
            <CategorySelect
              id="category-filter"
              value={category}
              onChange={(v) => {
                setCategory(v);
                setHistoryLimit(20);
              }}
              all
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setHistoryLimit(20);
              }}
            >
              <SelectTrigger
                className="filter-select"
                aria-label="Stok durumuna göre filtrele"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm stok durumları</SelectItem>
                <SelectItem value="low">Düşük stok ve tükenenler</SelectItem>
                <SelectItem value="zero">Yalnızca tükenenler</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!data ? (
            <div className="loading-state" role="status">
              {error
                ? "Çalışma alanı açılamadı."
                : "Ürünler ve hareketler yükleniyor…"}
            </div>
          ) : (
            <>
              <TabsContent value="inventory" className="m-0">
                {visible.length ? (
                  <Table className="stock-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="hide-tablet">Kategori</TableHead>
                        <TableHead>Stok</TableHead>
                        <TableHead className="hide-mobile">Alt sınır</TableHead>
                        <TableHead className="hide-mobile">Durum</TableHead>
                        <TableHead className="text-right pr-6">İşlem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="product-cell">
                              <span className="product-symbol">
                                <Package size={19} />
                              </span>
                              <div>
                                <button
                                  className="product-name"
                                  onClick={() => {
                                    setDetailId(p.id);
                                    setDetailLimit(20);
                                  }}
                                >
                                  {p.name}
                                </button>
                                <span className="sku">{p.sku}</span>
                                <span className="mobile-category">
                                  <Status product={p} />
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hide-tablet">
                            {p.category}
                          </TableCell>
                          <TableCell>
                            <span className="number">{num(p.stock)}</span>
                            <span className="unit hide-mobile">adet</span>
                          </TableCell>
                          <TableCell className="hide-mobile">
                            {num(p.reorderPoint)}
                          </TableCell>
                          <TableCell className="hide-mobile">
                            <Status product={p} />
                          </TableCell>
                          <TableCell>
                            <div className="row-actions">
                              <Button
                                variant="outline"
                                onClick={() => openMovement(p, "in")}
                                aria-label={`${p.name}: stok girişi`}
                              >
                                <ArrowDownLeft />
                                Giriş
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => openMovement(p, "out")}
                                aria-label={`${p.name}: stok çıkışı`}
                              >
                                <ArrowUpRight />
                                Çıkış
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="empty-state">
                    <Search className="mx-auto" size={30} />
                    <h3>Bu filtrelerle ürün bulunamadı.</h3>
                    <p>Aramayı temizle veya farklı bir stok durumu seç.</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setSearch("");
                        setCategory("all");
                        setStatus("all");
                      }}
                    >
                      Filtreleri temizle
                    </Button>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="history" className="m-0">
                <div className="px-6">
                  {visibleHistory.length ? (
                    <>
                      <MovementList
                        movements={visibleHistory.slice(0, historyLimit)}
                        showProduct
                      />
                      {visibleHistory.length > historyLimit && (
                        <Button
                          variant="outline"
                          className="my-5"
                          onClick={() => setHistoryLimit((n) => n + 20)}
                        >
                          Daha fazla hareket göster
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <History className="mx-auto" size={30} />
                      <h3>Henüz hareket yok.</h3>
                      <p>
                        Stok girişi veya çıkışı kaydettiğinde burada görünür.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </>
          )}
          <div className="board-footer">
            <span>
              {tab === "inventory"
                ? `${visible.length} / ${products.length} ürün gösteriliyor`
                : `${Math.min(historyLimit, visibleHistory.length)} / ${visibleHistory.length} hareket gösteriliyor`}
            </span>
            <span>
              {data ? `Son okuma: ${date(data.asOf)}` : "Sunucuya bağlanılıyor"}
            </span>
          </div>
        </Tabs>
        <footer className="bottom-note">
          <p>
            <ShieldCheck size={16} className="inline mr-1" /> Örnek ürünlerle
            başlayan bu alan, bu tarayıcıya özeldir. Kayıtların sunucuda
            saklanır; çerezleri silersen bu alana erişimini kaybedersin.
          </p>
          <a href="/ministock-source.zip" className="footer-link">
            <Download size={16} />
            Kaynak kodu indir
          </a>
        </footer>
      </main>
      <Dialog
        open={productOpen}
        onOpenChange={(open) => {
          if (!saving) setProductOpen(open);
        }}
      >
        <DialogContent
          className="dialog-panel bg-white"
          showCloseButton={false}
        >
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              aria-label="Kapat"
              disabled={saving}
            >
              <X />
            </Button>
          </DialogClose>
          <DialogHeader>
            <DialogTitle className="text-2xl">Yeni ürün</DialogTitle>
            <DialogDescription>
              Ürün kodunu bir kez belirle; sonraki değişimleri stok hareketi
              olarak kaydet.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitProduct} className="form">
            <label className="field">
              Ürün adı
              <input
                required
                minLength={2}
                maxLength={80}
                placeholder="Örn. Raspberry Pi 5"
                value={productForm.name}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <div className="field-row">
              <label className="field">
                Ürün kodu
                <input
                  required
                  minLength={2}
                  maxLength={32}
                  pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}"
                  placeholder="Örn. ELE-006"
                  value={productForm.sku}
                  onChange={(e) =>
                    setProductForm((f) => ({
                      ...f,
                      sku: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
              <div className="field">
                <label htmlFor="new-category">Kategori</label>
                <CategorySelect
                  id="new-category"
                  value={productForm.category}
                  onChange={(v) =>
                    setProductForm((f) => ({ ...f, category: v }))
                  }
                />
              </div>
            </div>
            <div className="field-row">
              <label className="field">
                Açılış stoku
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="999999"
                  step="1"
                  required
                  value={productForm.initialQuantity}
                  onChange={(e) =>
                    setProductForm((f) => ({
                      ...f,
                      initialQuantity: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Düşük stok sınırı
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="999999"
                  step="1"
                  required
                  value={productForm.reorderPoint}
                  onChange={(e) =>
                    setProductForm((f) => ({
                      ...f,
                      reorderPoint: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <p className="form-note">
              Miktar bu sınıra eşit veya altındaysa düşük stok uyarısı
              gösterilir. Paket ve setleri birer stok birimi olarak say.
            </p>
            {formError && (
              <p role="alert" className="form-error">
                {formError}
              </p>
            )}
            <div className="form-footer">
              <Button
                type="button"
                variant="outline"
                onClick={() => setProductOpen(false)}
                disabled={saving}
              >
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Kaydediliyor…" : "Ürünü kaydet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!movementProduct}
        onOpenChange={(open) => {
          if (!open && !saving) setMovementProduct(null);
        }}
      >
        <DialogContent
          className="dialog-panel bg-white"
          showCloseButton={false}
        >
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              aria-label="Kapat"
              disabled={saving}
            >
              <X />
            </Button>
          </DialogClose>
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {direction === "in" ? "Stok girişi" : "Stok çıkışı"}
            </DialogTitle>
            <DialogDescription>
              {movementProduct?.name} · {movementProduct?.sku}
            </DialogDescription>
          </DialogHeader>
          <form className="form" onSubmit={submitMovement}>
            <div className="summary-box">
              <span>Mevcut stok</span>
              <strong>
                {num(liveMovementProduct?.stock ?? 0)}{" "}
                <span className="unit">adet</span>
              </strong>
            </div>
            <label className="field">
              {direction === "in" ? "Giren miktar" : "Çıkan miktar"}
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                min="1"
                max="999999"
                step="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label className="field">
              Hareket açıklaması
              <textarea
                required
                minLength={2}
                maxLength={200}
                placeholder={
                  direction === "in"
                    ? "Örn. Tedarikçiden teslim alındı"
                    : "Örn. Robot prototipi için kullanıldı"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p className="form-note">
              İşlem sonrası beklenen stok:{" "}
              <strong>
                {movementValid ? `${num(expectedStock)} adet` : "—"}
              </strong>
              . Kayıt sırasında güncel stok tekrar kontrol edilir.
            </p>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="form-footer">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMovementProduct(null)}
                disabled={saving}
              >
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving || !movementValid}>
                {saving
                  ? "Kaydediliyor…"
                  : direction === "in"
                    ? "Girişi kaydet"
                    : "Çıkışı kaydet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <SheetContent
          className="sheet-panel w-full sm:max-w-lg bg-white"
          showCloseButton={false}
        >
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              aria-label="Kapat"
            >
              <X />
            </Button>
          </SheetClose>
          <SheetHeader className="px-6 pt-8 pr-14">
            <SheetTitle className="text-2xl">
              {detail?.name ?? "Ürün"}
            </SheetTitle>
            <SheetDescription>
              {detail?.sku} · {detail?.category}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="sheet-body">
              <Status product={detail} />
              <div className="sheet-meta">
                <div>
                  <small>Mevcut stok</small>
                  <strong>{num(detail.stock)}</strong>
                </div>
                <div>
                  <small>Düşük stok sınırı</small>
                  <strong>{num(detail.reorderPoint)}</strong>
                </div>
              </div>
              <h3 className="font-semibold text-lg">Hareket geçmişi</h3>
              <p className="form-note">
                {detailHistory.length} hareket · Yeniden eskiye
              </p>
              {detailHistory.length ? (
                <MovementList movements={detailHistory.slice(0, detailLimit)} />
              ) : (
                <p className="form-note mt-5">
                  Bu ürün için henüz stok hareketi yok.
                </p>
              )}
              {detailHistory.length > detailLimit && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setDetailLimit((n) => n + 20)}
                >
                  Daha fazla göster
                  <ChevronRight />
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
