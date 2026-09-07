import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DndContext, pointerWithin, DragOverlay, PointerSensor, useSensor, useSensors, TouchSensor, useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toBlob } from 'html-to-image'; 
import '../index.css';

// ⚠️ PUT YOUR TAILSCALE HTTPS URL HERE! 
const API_BASE = "https://linux.tail2f8d37.ts.net:8444/api";
const ITEMS_API = `${API_BASE}/items`;
const TIERS_API = `${API_BASE}/tiers`;
const LISTS_API = `${API_BASE}/lists`;

const COLORS = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-gray-400"];

// 🚀 FIX: Set to 720px for good downloads, but 0.5 quality for tiny DB payload
const recompressBase64 = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 720; 
      let width = img.width;
      let height = img.height;
      if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
      else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/webp', 0.5)); 
    };
    img.src = base64Str;
  });
};

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        recompressBase64(event.target.result as string).then(resolve);
      }
    };
    reader.readAsDataURL(file);
  });
};

function SortableItem({ id, label, image, onPreview }: { id: string, label: string, image?: string, onPreview?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes} 
      onDoubleClick={onPreview}
      title={label} 
      className="w-16 h-16 md:w-20 md:h-20 touch-manipulation bg-gray-700 flex items-center justify-center text-center font-bold text-xs md:text-sm shadow-sm cursor-grab active:cursor-grabbing hover:opacity-80 z-50 relative overflow-hidden shrink-0"
    >
      {image ? <img src={image} alt={label} loading="lazy" className="w-full h-full object-cover pointer-events-none" /> : <span className="p-1 break-words">{label}</span>}
    </div>
  );
}

function SortableZone({ id, items, className, onPreview }: { id: string, items: any[], className: string, onPreview: (item: any) => void }) {
  const { setNodeRef } = useDroppable({ id }); 
  return (
    <SortableContext id={id} items={items.map(i => i.id)} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className={className}>
        {items.map(item => <SortableItem key={item.id} id={item.id} label={item.label} image={item.image} onPreview={() => onPreview(item)} />)}
      </div>
    </SortableContext>
  );
}

function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });
  return (
    <div ref={setNodeRef} className={`w-full p-4 rounded-lg border-2 border-dashed flex items-center justify-center font-bold text-xl transition-colors duration-200 mt-4 ${isOver ? 'bg-red-900 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-gray-900 border-gray-700 text-gray-500'}`}>
      🗑️ Drag Here to Delete
    </div>
  );
}

export default function Editor() {
  const { id: listId } = useParams(); 

  const [listData, setListData] = useState<any>({ name: "Loading...", notes: "" });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const [items, setItems] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]); 
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierLabel, setEditTierLabel] = useState("");
  const [editTierColor, setEditTierColor] = useState("");
  
  const [syncingCount, setSyncingCount] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [editDescription, setEditDescription] = useState("");

  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }) 
  );

  useEffect(() => {
    if (!listId) return;

    const cachedList = localStorage.getItem(`list_${listId}`);
    const cachedItems = localStorage.getItem(`items_${listId}`);
    const cachedTiers = localStorage.getItem(`tiers_${listId}`);

    if (cachedList) { const data = JSON.parse(cachedList); setListData(data); setEditTitle(data.name); }
    if (cachedItems) setItems(JSON.parse(cachedItems));
    if (cachedTiers) setTiers(JSON.parse(cachedTiers));

    fetch(`${LISTS_API}/single?id=${listId}`).then(res => res.json()).then(data => {
      if (data) { setListData(data); setEditTitle(data.name); localStorage.setItem(`list_${listId}`, JSON.stringify(data)); }
    });
    fetch(`${ITEMS_API}?list_id=${listId}`).then(res => res.json()).then(data => {
      if (data) { setItems(data); localStorage.setItem(`items_${listId}`, JSON.stringify(data)); }
    });
    fetch(`${TIERS_API}?list_id=${listId}`).then(res => res.json()).then(data => {
      if (data) { setTiers(data); localStorage.setItem(`tiers_${listId}`, JSON.stringify(data)); }
    });
  }, [listId]);

  // 🚀 FIX: The Legacy Purge. Scans the DB for old uncompressed images and fixes them permanently.
  const handleOptimizeDatabase = async () => {
    if (!window.confirm("This will scan and compress all massive legacy images in this tier list to permanently fix lag. Continue?")) return;
    
    setIsOptimizing(true);
    try {
      const optimizedItems = await Promise.all(items.map(async (item) => {
        // If string is longer than ~150KB, it's a legacy uncompressed image
        if (item.image && item.image.length > 200000) {
          const fixedBase64 = await recompressBase64(item.image);
          return { ...item, image: fixedBase64 };
        }
        return item;
      }));

      setItems(optimizedItems);
      localStorage.setItem(`items_${listId}`, JSON.stringify(optimizedItems));
      
      await fetch(ITEMS_API + "/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(optimizedItems) });
      alert("✅ Database Optimized! All drag-and-drop lag should now be completely gone.");
    } catch (err) {
      alert("Optimization failed. Check network connection.");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleExportPNG = async () => {
    if (!captureRef.current) return;
    setSyncingCount(prev => prev + 1); 
    try {
      const blob = await toBlob(captureRef.current, {
        backgroundColor: '#111111', pixelRatio: 2, 
        filter: (node) => {
          if (node instanceof HTMLElement) return !node.hasAttribute('data-html2canvas-ignore');
          return true;
        }
      });
      if (!blob) throw new Error("Failed to generate blob.");
      const url = URL.createObjectURL(blob);
      setExportPreview(url); 
    } catch (err) { alert("Failed to export the image."); } finally { setSyncingCount(prev => prev - 1); }
  };

  const saveListMetadata = (updatedData: any) => {
    localStorage.setItem(`list_${listId}`, JSON.stringify(updatedData));
    setSyncingCount(prev => prev + 1);
    fetch(LISTS_API + "/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedData) })
      .finally(() => setSyncingCount(prev => prev - 1));
  };

  const handleSaveTitle = () => {
    const updated = { ...listData, name: editTitle.trim() };
    setListData(updated);
    saveListMetadata(updated);
    setIsEditingTitle(false);
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setListData({ ...listData, notes: e.target.value });
  const handleNotesBlur = () => saveListMetadata(listData);

  const saveToDatabase = (newItems: any[]) => {
    localStorage.setItem(`items_${listId}`, JSON.stringify(newItems));
    setSyncingCount(prev => prev + 1); 
    fetch(ITEMS_API + "/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newItems) })
      .catch(err => console.error(err))
      .finally(() => setSyncingCount(prev => prev - 1)); 
  };

  const saveTiersToDatabase = (updatedTiers: any[]) => {
    localStorage.setItem(`tiers_${listId}`, JSON.stringify(updatedTiers));
    setSyncingCount(prev => prev + 1);
    fetch(TIERS_API + "/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedTiers) })
      .finally(() => setSyncingCount(prev => prev - 1));
  };

  const handleAddTier = () => {
    const newTier = { id: `tier-${listId}-${Date.now()}`, label: "NEW", color: "bg-gray-400", tier_list_id: Number(listId) };
    setSyncingCount(prev => prev + 1);
    fetch(TIERS_API + "/new", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTier) })
      .then(res => res.json())
      .then(savedTier => {
        const updated = [...tiers, savedTier];
        setTiers(updated);
        localStorage.setItem(`tiers_${listId}`, JSON.stringify(updated));
      })
      .finally(() => setSyncingCount(prev => prev - 1));
  };

  const handleDeleteTier = (tierId: string) => {
    if (!window.confirm("Delete this tier? Any items inside it will be moved to the Unranked Pool.")) return;
    const updatedItems = items.map(item => item.tier === tierId ? { ...item, tier: 'pool' } : item);
    const updatedTiers = tiers.filter(t => t.id !== tierId);
    
    setItems(updatedItems);
    setTiers(updatedTiers);
    setEditingTierId(null);
    
    localStorage.setItem(`items_${listId}`, JSON.stringify(updatedItems));
    localStorage.setItem(`tiers_${listId}`, JSON.stringify(updatedTiers));

    setSyncingCount(prev => prev + 1);
    fetch(`${TIERS_API}?id=${tierId}`, { method: 'DELETE' })
      .then(() => saveToDatabase(updatedItems))
      .finally(() => setSyncingCount(prev => prev - 1));
  };

  const moveTier = (tierId: string, direction: number) => {
    const index = tiers.findIndex(t => t.id === tierId);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tiers.length) return; 
    const newTiers = [...tiers];
    const temp = newTiers[index];
    newTiers[index] = newTiers[newIndex];
    newTiers[newIndex] = temp;
    const updatedTiers = newTiers.map((t, i) => ({ ...t, order_index: i }));
    setTiers(updatedTiers); 
    saveTiersToDatabase(updatedTiers);
  };

  const startEditing = (tier: any) => { setEditingTierId(tier.id); setEditTierLabel(tier.label); setEditTierColor(tier.color); };

  const saveTierEdit = (tier: any) => {
    const updatedTier = { ...tier, label: editTierLabel.trim(), color: editTierColor };
    const updatedTiers = tiers.map(t => t.id === tier.id ? updatedTier : t);
    setTiers(updatedTiers);
    setEditingTierId(null);
    localStorage.setItem(`tiers_${listId}`, JSON.stringify(updatedTiers));
    setSyncingCount(prev => prev + 1);
    fetch(TIERS_API + "/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedTier) })
      .finally(() => setSyncingCount(prev => prev - 1));
  };

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.indexOf('image') !== -1) {
          const file = clipboardItems[i].getAsFile();
          if (!file) continue;
          const compressedBase64 = await compressImage(file);
          const newItem = { id: `item-${Date.now()}`, label: 'Pasted Image', image: compressedBase64, tier: 'pool', tier_list_id: Number(listId) };
          setItems((prev) => { const updated = [...prev, newItem]; saveToDatabase(updated); return updated; });
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [listId]);

  function handleAddText(e: React.FormEvent) {
    e.preventDefault(); 
    if (inputValue.trim() === '') return; 
    const newItem = { id: `item-${Date.now()}`, label: inputValue.trim(), tier: 'pool', tier_list_id: Number(listId) };
    setItems((prev) => { const updated = [...prev, newItem]; saveToDatabase(updated); return updated; });
    setInputValue(''); 
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems = await Promise.all(Array.from(files).map(async (file, index) => {
      const compressedBase64 = await compressImage(file);
      return { id: `item-${Date.now()}-${index}`, label: file.name, image: compressedBase64, tier: 'pool', tier_list_id: Number(listId) };
    }));
    setItems((prev) => { const updated = [...prev, ...newItems]; saveToDatabase(updated); return updated; });
  }

  function handleDragStart(event: any) { setActiveId(event.active.id); }

  function handleDragOver(event: any) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId || overId === 'trash') return;

    setItems((prevItems) => {
      const activeIndex = prevItems.findIndex(item => item.id === activeId);
      const overIndex = prevItems.findIndex(item => item.id === overId);
      const activeItem = prevItems[activeIndex];
      const overItem = prevItems[overIndex];
      if (!activeItem) return prevItems;
      const isOverContainer = tiers.some(t => t.id === overId) || overId === 'pool';

      if (isOverContainer) {
        if (activeItem.tier === overId) return prevItems; 
        const updatedItems = [...prevItems];
        updatedItems[activeIndex] = { ...activeItem, tier: String(overId) };
        return arrayMove(updatedItems, activeIndex, updatedItems.length - 1);
      }
      if (overItem && activeItem.tier !== overItem.tier) {
        const updatedItems = [...prevItems];
        updatedItems[activeIndex] = { ...activeItem, tier: overItem.tier };
        return arrayMove(updatedItems, activeIndex, overIndex);
      }
      return prevItems;
    });
  }

  function handleDragEnd(event: any) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    if (over.id === 'trash') {
      setItems((prev) => {
        const updated = prev.filter(item => item.id !== active.id);
        localStorage.setItem(`items_${listId}`, JSON.stringify(updated));
        fetch(`${ITEMS_API}?id=${active.id}`, { method: 'DELETE' }).catch(err => console.error(err));
        return updated;
      });
      return;
    }
    const activeIndex = items.findIndex(item => item.id === active.id);
    const overIndex = items.findIndex(item => item.id === over.id);

    if (overIndex !== -1 && activeIndex !== overIndex) {
      setItems((prevItems) => {
        const newlySortedItems = arrayMove(prevItems, activeIndex, overIndex);
        saveToDatabase(newlySortedItems); 
        return newlySortedItems;
      });
    } else {
      saveToDatabase(items);
    }
  }

  const handleDownloadPreview = () => {
    if (!previewItem) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      const pngDataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngDataUrl;
      const cleanName = editDescription.split('.')[0] || 'Downloaded_Image'; 
      link.download = `${cleanName}.png`; 
      link.click();
    };
    img.src = previewItem.image;
  };

  const handleSavePreview = () => {
    if (!previewItem) return;
    const updatedItems = items.map(i => i.id === previewItem.id ? { ...i, label: editDescription.trim() } : i);
    setItems(updatedItems);
    saveToDatabase(updatedItems);
    setPreviewItem(null);
  };

  const activeItemData = items.find(i => i.id === activeId);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="hidden bg-red-500 bg-orange-500 bg-yellow-500 bg-green-500 bg-blue-500 bg-purple-500 bg-pink-500 bg-gray-400"></div>

      <div className="min-h-screen bg-[#111111] text-white font-sans flex flex-col items-center">
        
        <div className="w-full max-w-4xl p-2 md:p-6 pt-6">
          <div className="w-full flex justify-between items-center mb-4 flex-wrap gap-2">
            <Link to="/" className="text-gray-400 hover:text-gray-200 font-semibold transition-colors flex items-center gap-2">
              ← Back to Menu
            </Link>
            
            <div className="flex items-center gap-2 md:gap-4">
              {syncingCount > 0 && <span className="text-gray-400 text-xs md:text-sm font-bold animate-pulse">☁️ Syncing...</span>}
              
              {/* 🚀 NEW: The Legacy Purge Button */}
              <button 
                onClick={handleOptimizeDatabase} 
                disabled={isOptimizing}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold py-1 px-3 md:px-4 rounded shadow-lg text-xs md:text-sm"
              >
                {isOptimizing ? "Optimizing..." : "🚀 Optimize DB"}
              </button>
              
              <button onClick={handleExportPNG} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-3 md:px-4 rounded shadow-lg text-xs md:text-sm flex items-center gap-2">
                📸 Export PNG
              </button>
            </div>
          </div>

          <div ref={captureRef} className="w-full bg-[#111111]">
            <div className="w-full mb-6 flex justify-center">
              {isEditingTitle ? (
                <div className="flex gap-2 w-full max-w-md">
                  <input autoFocus type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()} className="flex-1 bg-gray-800 text-3xl font-bold text-center text-white border-b-2 border-blue-500 focus:outline-none py-1" />
                  <button onClick={handleSaveTitle} className="bg-green-600 hover:bg-green-500 px-4 rounded font-bold" data-html2canvas-ignore>Save</button>
                </div>
              ) : (
                <h1 onClick={() => setIsEditingTitle(true)} className="text-3xl md:text-5xl font-bold text-gray-100 cursor-pointer hover:text-blue-400 transition-colors group flex items-center gap-3">
                  {listData.name}
                  <span className="text-xl opacity-0 group-hover:opacity-100 text-gray-500" data-html2canvas-ignore>✏️</span>
                </h1>
              )}
            </div>
            
            <div className="w-full flex flex-col border-2 border-black bg-[#1a1a1a] mb-6 shadow-xl">
              {tiers.map((tier, index) => (
                <div key={tier.id} className="flex border-b border-black min-h-[64px] md:min-h-[80px]">
                  
                  {editingTierId === tier.id ? (
                    <div className="w-32 md:w-48 shrink-0 flex flex-col p-2 gap-2 bg-gray-800 border-r border-black z-10 justify-center" data-html2canvas-ignore>
                      <input autoFocus value={editTierLabel} onChange={(e) => setEditTierLabel(e.target.value)} className="w-full text-black px-1 font-bold rounded" />
                      <div className="flex flex-wrap gap-1 justify-center">
                        {COLORS.map(c => (
                          <button key={c} onClick={() => setEditTierColor(c)} className={`w-4 h-4 md:w-5 md:h-5 rounded-full cursor-pointer border-2 ${editTierColor === c ? 'border-white' : 'border-transparent'} ${c}`} />
                        ))}
                      </div>
                      <div className="flex justify-between gap-1 w-full">
                         <button onClick={() => moveTier(tier.id, -1)} disabled={index === 0} className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold py-1 rounded">⬆️</button>
                         <button onClick={() => moveTier(tier.id, 1)} disabled={index === tiers.length - 1} className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold py-1 rounded">⬇️</button>
                      </div>
                      <div className="flex justify-between gap-1 w-full">
                        <button onClick={() => saveTierEdit(tier)} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1 rounded">Save</button>
                        <button onClick={() => handleDeleteTier(tier.id)} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-2 py-1 rounded" title="Delete Row">🗑️</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`${tier.color} w-20 md:w-24 shrink-0 flex items-center justify-center text-xl md:text-2xl font-bold text-black border-r border-black relative group`}>
                      <span className="break-words px-1 text-center leading-tight">{tier.label}</span>
                      <button onClick={() => startEditing(tier)} className="absolute top-1 right-1 text-xs opacity-0 group-hover:opacity-100 hover:scale-125 transition-all bg-black/30 rounded p-1" title="Edit Tier" data-html2canvas-ignore>
                        ⚙️
                      </button>
                    </div>
                  )}

                  <SortableZone id={tier.id} items={items.filter(item => item.tier === tier.id)} className="flex-1 p-1 flex flex-wrap content-start gap-1" onPreview={(item) => { setPreviewItem(item); setEditDescription(item.label); }} />
                </div>
              ))}
            </div>
          </div>

          <TrashZone />
          
          <div className="mt-8 mb-48 md:mb-56">
            <h3 className="text-xl font-bold mb-2 text-gray-300">Notes & Context</h3>
            <textarea value={listData.notes} onChange={handleNotesChange} onBlur={handleNotesBlur} placeholder="Add your notes here..." className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-white focus:outline-none focus:border-blue-500 min-h-[120px]" />
          </div>
        </div>

        <div className="sticky bottom-0 w-full max-w-4xl z-[60] bg-[#111111] border-t border-gray-700 md:border-t-2 md:border-gray-800 pb-8 md:pb-6 shadow-[0_-15px_30px_rgba(0,0,0,0.8)]">
          <div className="w-full px-2 md:px-0 pt-4">
            
            <div className="mb-2 bg-gray-800 p-2 md:p-4 rounded border border-gray-700 shadow-xl flex flex-col md:flex-row gap-2 md:gap-4 justify-between items-center">
              <form onSubmit={handleAddText} className="flex gap-2 w-full md:w-auto">
                <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Type a label..." className="flex-1 md:w-64 bg-gray-900 border border-gray-600 rounded px-3 py-1 md:py-2 text-white focus:outline-none focus:border-blue-500" />
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-4 rounded shadow">Add</button>
              </form>

              <div className="flex gap-2 w-full md:w-auto">
                <button onClick={handleAddTier} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-1 px-4 rounded shadow flex-1 md:flex-none flex items-center justify-center" title="Add new tier row">
                  ➕ Row
                </button>
                <label className="bg-green-600 hover:bg-green-500 text-white font-bold py-1 px-6 rounded shadow cursor-pointer text-center flex-1 md:flex-none">
                  Upload Images
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            </div>

            <div className="bg-[#1a1a1a] border-2 border-black p-2 shadow-xl">
              <h2 className="text-gray-400 font-bold text-sm mb-1 uppercase tracking-wide">Unranked Pool</h2>
              <SortableZone id="pool" items={items.filter(item => item.tier === 'pool')} className="min-h-[100px] max-h-[30vh] overflow-y-auto flex flex-wrap content-start gap-1 pb-4" onPreview={(item) => { setPreviewItem(item); setEditDescription(item.label); }} />
            </div>

          </div>
        </div>
      </div>
      
      {previewItem && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-gray-900 rounded-xl p-4 shadow-2xl border border-gray-700 flex flex-col items-center">
            
            <img src={previewItem.image} alt={editDescription} className="max-w-full max-h-[50vh] object-contain border-4 border-gray-700 rounded-lg shadow-2xl mb-4" />

            <div className="w-full flex flex-col gap-2 mb-6">
              <label className="text-gray-400 text-sm font-bold uppercase tracking-wide">Invisible Description / Label</label>
              <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="e.g. Ichiran Ramen - Shibuya" className="w-full bg-gray-800 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" />
              <p className="text-xs text-gray-500">Hover over the image on a computer to see this text!</p>
            </div>

            <div className="flex flex-wrap gap-2 w-full justify-center">
              <button onClick={handleSavePreview} className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded font-bold text-white shadow-lg flex-1 md:flex-none">💾 Save Changes</button>
              <button onClick={() => setPreviewItem(null)} className="bg-gray-600 hover:bg-gray-500 px-6 py-2 rounded font-bold text-white shadow-lg flex-1 md:flex-none">Cancel</button>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800 w-full flex justify-center">
              <button onClick={(e) => { e.stopPropagation(); handleDownloadPreview(); }} className="hidden md:block text-blue-400 hover:text-blue-300 font-bold underline">Download Original PNG</button>
              <p className="text-gray-500 text-xs md:hidden">Tip: Long-press the image to Save to Photos</p>
            </div>
          </div>
        </div>
      )}

      {exportPreview && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => { setExportPreview(null); URL.revokeObjectURL(exportPreview); }}>
          <img src={exportPreview} alt="Exported Tier List" className="max-w-full max-h-[75vh] object-contain border-4 border-gray-700 rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <p className="text-gray-300 text-sm mt-4 md:hidden text-center font-bold">✅ Tier List Generated!<br/><span className="font-normal text-gray-400">Long-press the image above to Save to Photos</span></p>
          <div className="flex gap-4 mt-6">
            <a href={exportPreview} download={`${listData.name}-TierList.png`} onClick={(e) => e.stopPropagation()} className="hidden md:block bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded font-bold text-white shadow-lg text-center">📥 Download PNG</a>
            <button onClick={() => { setExportPreview(null); URL.revokeObjectURL(exportPreview); }} className="bg-gray-600 hover:bg-gray-500 px-6 py-2 rounded font-bold text-white shadow-lg">Close</button>
          </div>
        </div>
      )}
      
      <DragOverlay>
        {activeId ? (
          <div className="w-16 h-16 md:w-20 md:h-20 touch-none bg-gray-700 flex items-center justify-center text-center font-bold text-xs md:text-sm shadow-2xl opacity-90 scale-110 cursor-grabbing overflow-hidden">
            {activeItemData?.image ? <img src={activeItemData.image} alt="dragging" className="w-full h-full object-cover pointer-events-none" /> : <span className="p-1 break-words">{activeItemData?.label}</span>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}