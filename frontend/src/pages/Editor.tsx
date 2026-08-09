import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DndContext, pointerWithin, DragOverlay, PointerSensor, useSensor, useSensors, TouchSensor, useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import '../index.css';

// REPLACE THESE WITH YOUR ACTUAL TAILSCALE IP
const ITEMS_API = "https://linux.tail2f8d37.ts.net:8444/api/items";
const TIERS_API = "https://linux.tail2f8d37.ts.net:8444/api/tiers";

const COLORS = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-gray-400"];

function SortableItem({ id, label, image }: { id: string, label: string, image?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="w-16 h-16 md:w-20 md:h-20 touch-none bg-gray-700 flex items-center justify-center text-center font-bold text-xs md:text-sm shadow-sm cursor-grab active:cursor-grabbing hover:opacity-80 z-50 relative overflow-hidden shrink-0">
      {image ? <img src={image} alt={label} className="w-full h-full object-cover pointer-events-none" /> : <span className="p-1 break-words">{label}</span>}
    </div>
  );
}

function SortableZone({ id, items, className }: { id: string, items: any[], className: string }) {
  const { setNodeRef } = useDroppable({ id }); 
  return (
    <SortableContext id={id} items={items.map(i => i.id)} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className={className}>
        {items.map(item => <SortableItem key={item.id} id={item.id} label={item.label} image={item.image} />)}
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

  const [items, setItems] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]); 
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierLabel, setEditTierLabel] = useState("");
  const [editTierColor, setEditTierColor] = useState("");
  const [savingCount, setSavingCount] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }) 
  );

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (savingCount > 0) {
        e.preventDefault();
        e.returnValue = "Your work is still saving. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [savingCount]);

  useEffect(() => {
    if (!listId) return;
    fetch(`${ITEMS_API}?list_id=${listId}`).then(res => res.json()).then(data => setItems(data || []));
    fetch(`${TIERS_API}?list_id=${listId}`).then(res => res.json()).then(data => setTiers(data || []));
  }, [listId]);

  const saveToDatabase = (newItems: any[]) => {
    setSavingCount(prev => prev + 1); 
    fetch(ITEMS_API + "/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItems)
    }).catch(err => console.error(err)).finally(() => setSavingCount(prev => prev - 1)); 
  };

  const handleAddTier = () => {
    const newTier = { id: `tier-${listId}-${Date.now()}`, label: "NEW", color: "bg-gray-400", tier_list_id: Number(listId) };
    
    setSavingCount(prev => prev + 1);
    fetch(TIERS_API + "/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTier)
    })
      .then(res => res.json())
      .then(savedTier => {
        // Because the backend sets this to the top, we PREPEND it to our local array!
        setTiers(prev => [...prev, savedTier]);
      })
      .finally(() => setSavingCount(prev => prev - 1));
  };

  // NEW: Delete Tier Row Logic
  const handleDeleteTier = (tierId: string) => {
    if (!window.confirm("Delete this tier? Any items inside it will be moved to the Unranked Pool.")) return;
    
    // 1. Move the items locally
    setItems(prev => prev.map(item => item.tier === tierId ? { ...item, tier: 'pool' } : item));
    // 2. Delete the tier locally
    setTiers(prev => prev.filter(t => t.id !== tierId));
    setEditingTierId(null);
    
    // 3. Tell the backend to delete it
    setSavingCount(prev => prev + 1);
    fetch(`${TIERS_API}?id=${tierId}`, { method: 'DELETE' }).finally(() => setSavingCount(prev => prev - 1));
  };

  // NEW: Move Tier Row Up/Down Logic
  const moveTier = (tierId: string, direction: number) => {
    const index = tiers.findIndex(t => t.id === tierId);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tiers.length) return; // Prevent going out of bounds

    const newTiers = [...tiers];
    // Swap the elements
    const temp = newTiers[index];
    newTiers[index] = newTiers[newIndex];
    newTiers[newIndex] = temp;

    // Update their order_indexes
    const updatedTiers = newTiers.map((t, i) => ({ ...t, order_index: i }));
    setTiers(updatedTiers); // Update screen instantly
    
    // Save new order to Database
    setSavingCount(prev => prev + 1);
    fetch(TIERS_API + "/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTiers)
    }).finally(() => setSavingCount(prev => prev - 1));
  };

  const startEditing = (tier: any) => {
    setEditingTierId(tier.id);
    setEditTierLabel(tier.label);
    setEditTierColor(tier.color);
  };

  const saveTierEdit = (tier: any) => {
    const updatedTier = { ...tier, label: editTierLabel.trim(), color: editTierColor };
    setTiers(prev => prev.map(t => t.id === tier.id ? updatedTier : t));
    setEditingTierId(null);
    setSavingCount(prev => prev + 1);
    fetch(TIERS_API + "/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTier)
    }).finally(() => setSavingCount(prev => prev - 1));
  };

  // ... [PASTE/ADD/UPLOAD EVENT LISTENERS STAY THE SAME] ...
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.indexOf('image') !== -1) {
          const file = clipboardItems[i].getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onloadend = () => {
            const newItem = { id: `item-${Date.now()}`, label: 'Pasted Image', image: reader.result as string, tier: 'pool', tier_list_id: Number(listId) };
            setItems((prev) => {
              const updated = [...prev, newItem];
              saveToDatabase(updated);
              return updated;
            });
          };
          reader.readAsDataURL(file);
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
    setItems((prev) => {
      const updated = [...prev, newItem];
      saveToDatabase(updated);
      return updated;
    });
    setInputValue(''); 
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const newItem = { id: `item-${Date.now()}`, label: file.name, image: reader.result as string, tier: 'pool', tier_list_id: Number(listId) };
      setItems((prev) => {
        const updated = [...prev, newItem];
        saveToDatabase(updated);
        return updated;
      });
    };
    reader.readAsDataURL(file);
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

  const activeItemData = items.find(i => i.id === activeId);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="hidden bg-red-500 bg-orange-500 bg-yellow-500 bg-green-500 bg-blue-500 bg-purple-500 bg-pink-500 bg-gray-400"></div>

      <div className="min-h-screen bg-[#111111] text-white p-2 md:p-6 font-sans flex flex-col items-center">
        
        <div className="w-full max-w-4xl mb-4 self-start md:self-auto md:w-full flex justify-between">
          <Link to="/" className="text-gray-400 hover:text-gray-200 font-semibold transition-colors flex items-center gap-2">
            ← Back to Menu
          </Link>
          {savingCount > 0 && <span className="text-yellow-500 font-bold animate-pulse">Saving...</span>}
        </div>
        
        <div className="w-full max-w-4xl flex flex-col border-2 border-black bg-[#1a1a1a] mb-2">
          {tiers.map((tier, index) => (
            <div key={tier.id} className="flex border-b border-black min-h-[64px] md:min-h-[80px]">
              
              {editingTierId === tier.id ? (
                <div className="w-32 md:w-48 shrink-0 flex flex-col p-2 gap-2 bg-gray-800 border-r border-black z-10 justify-center">
                  <input autoFocus value={editTierLabel} onChange={(e) => setEditTierLabel(e.target.value)} className="w-full text-black px-1 font-bold rounded" />
                  <div className="flex flex-wrap gap-1 justify-center">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setEditTierColor(c)} className={`w-4 h-4 md:w-5 md:h-5 rounded-full cursor-pointer border-2 ${editTierColor === c ? 'border-white' : 'border-transparent'} ${c}`} />
                    ))}
                  </div>
                  
                  {/* NEW: REORDER BUTTONS */}
                  <div className="flex justify-between gap-1 w-full">
                     <button onClick={() => moveTier(tier.id, -1)} disabled={index === 0} className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold py-1 rounded">⬆️</button>
                     <button onClick={() => moveTier(tier.id, 1)} disabled={index === tiers.length - 1} className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold py-1 rounded">⬇️</button>
                  </div>

                  {/* NEW: SAVE & DELETE BUTTONS */}
                  <div className="flex justify-between gap-1 w-full">
                    <button onClick={() => saveTierEdit(tier)} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1 rounded">Save</button>
                    <button onClick={() => handleDeleteTier(tier.id)} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-2 py-1 rounded" title="Delete Row">🗑️</button>
                  </div>
                </div>
              ) : (
                <div className={`${tier.color} w-20 md:w-24 shrink-0 flex items-center justify-center text-xl md:text-2xl font-bold text-black border-r border-black relative group`}>
                  <span className="break-words px-1 text-center leading-tight">{tier.label}</span>
                  <button onClick={() => startEditing(tier)} className="absolute top-1 right-1 text-xs opacity-0 group-hover:opacity-100 hover:scale-125 transition-all bg-black/30 rounded p-1" title="Edit Tier">
                    ⚙️
                  </button>
                </div>
              )}

              <SortableZone id={tier.id} items={items.filter(item => item.tier === tier.id)} className="flex-1 p-1 flex flex-wrap content-start gap-1" />
            </div>
          ))}
        </div>
        
        {/* NEW: Add Row Button */}
        <div className="w-full max-w-4xl flex justify-center mb-12">
          <button onClick={handleAddTier} className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-bold py-2 px-6 rounded-b border-2 border-t-0 border-black transition-colors">
            ➕ Add Row
          </button>
        </div>
        
        <div className="w-full max-w-4xl px-2 md:px-0">
          <div className="mb-6 bg-gray-800 p-4 rounded border border-gray-700 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center">
            <form onSubmit={handleAddText} className="flex gap-2 w-full md:w-auto">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Type a label..." className="flex-1 md:w-64 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded shadow">Add Text</button>
            </form>
            <span className="text-gray-500 font-bold hidden md:block">OR</span>
            <label className="w-full md:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded shadow cursor-pointer text-center">
              Upload Image
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          <SortableZone id="pool" items={items.filter(item => item.tier === 'pool')} className="bg-[#1a1a1a] border-2 border-black min-h-[150px] p-2 flex flex-wrap content-start gap-1 shadow-xl" />
          <TrashZone />
        </div>
      </div>
      
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