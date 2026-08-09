import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  DndContext, 
  pointerWithin, 
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
  useDroppable
} from '@dnd-kit/core';
import { 
  SortableContext, 
  rectSortingStrategy, 
  useSortable, 
  arrayMove 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import '../index.css';

const TIERS = [
  { id: 's', label: 'S', color: 'bg-red-500' },
  { id: 'a', label: 'A', color: 'bg-orange-500' },
  { id: 'b', label: 'B', color: 'bg-yellow-500' },
  { id: 'c', label: 'C', color: 'bg-green-500' },
  { id: 'd', label: 'D', color: 'bg-blue-500' },
];

function SortableItem({ id, label, image }: { id: string, label: string, image?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes} 
      // TIERMAKER UI: Smaller squares (w-20), sharp corners, no padding, completely filled by the image
      className="w-16 h-16 md:w-20 md:h-20 touch-none bg-gray-700 flex items-center justify-center text-center font-bold text-xs md:text-sm shadow-sm cursor-grab active:cursor-grabbing hover:opacity-80 z-50 relative overflow-hidden shrink-0"
    >
      {/* If it has an image, draw the image. Otherwise, just draw the text label. */}
      {image ? (
        <img src={image} alt={label} className="w-full h-full object-cover pointer-events-none" />
      ) : (
        <span className="p-1 break-words">{label}</span>
      )}
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

export default function Editor() {
  const { id: listId } = useParams(); 
  
  // REPLACE THIS WITH YOUR ACTUAL TAILSCALE IP
  const BACKEND_URL = "https://linux.tail2f8d37.ts.net:8444/api/items";

  const [items, setItems] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }) 
  );

  useEffect(() => {
    fetch(`${BACKEND_URL}?list_id=${listId}`)
      .then(response => response.json())
      .then(data => {
        if (data && data.length > 0) setItems(data);
        else setItems([]); 
      })
      .catch(error => console.error("Error fetching data:", error));
  }, [listId]);
  
  // NEW: Global Ctrl+V Paste Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      for (let i = 0; i < clipboardItems.length; i++) {
        // Check if the pasted data is an image
        if (clipboardItems[i].type.indexOf('image') !== -1) {
          const file = clipboardItems[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            
            const newItem = { 
              id: `item-${Date.now()}`, 
              label: 'Pasted Image', 
              image: base64String, 
              tier: 'pool', 
              tier_list_id: Number(listId) 
            };
            
            // Use the "functional" state update so we don't accidentally overwrite data
            setItems((prevItems) => {
              const updatedItems = [...prevItems, newItem];
              saveToDatabase(updatedItems);
              return updatedItems;
            });
          };
          reader.readAsDataURL(file);
        }
      }
    };

    // Attach the listener to the whole webpage
    window.addEventListener('paste', handlePaste);
    
    // Cleanup the listener if we leave the Editor page
    return () => window.removeEventListener('paste', handlePaste);
  }, [listId]); // Re-run this setup if the listId changes

  const saveToDatabase = (newItems: any[]) => {
    fetch(BACKEND_URL + "/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItems)
    }).catch(error => console.error("Error saving data:", error));
  };

  // 1. Adds a text-only item (Your existing function)
  function handleAddText(e: React.FormEvent) {
    e.preventDefault(); 
    if (inputValue.trim() === '') return; 
    const newItem = { id: `item-${Date.now()}`, label: inputValue.trim(), tier: 'pool', tier_list_id: Number(listId) };
    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    saveToDatabase(updatedItems); 
    setInputValue(''); 
  }

  // 2. NEW: Handles the File Upload and Base64 Conversion
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    // This runs exactly when the file is done being read by the browser
    reader.onloadend = () => {
      const base64String = reader.result as string; 
      
      const newItem = { 
        id: `item-${Date.now()}`, 
        label: file.name, // We save the filename just in case
        image: base64String, // We save the raw pixel text
        tier: 'pool', 
        tier_list_id: Number(listId) 
      };
      
      const updatedItems = [...items, newItem];
      setItems(updatedItems);
      saveToDatabase(updatedItems);
    };

    // This command starts the translation process
    reader.readAsDataURL(file);
  }

  function handleDragStart(event: any) { setActiveId(event.active.id); }

  function handleDragOver(event: any) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    setItems((prevItems) => {
      const activeIndex = prevItems.findIndex(item => item.id === activeId);
      const overIndex = prevItems.findIndex(item => item.id === overId);
      const activeItem = prevItems[activeIndex];
      const overItem = prevItems[overIndex];

      if (!activeItem) return prevItems;
      const isOverContainer = TIERS.some(t => t.id === overId) || overId === 'pool';

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

  // Get the active item for the Drag Overlay (the Ghost image)
  const activeItemData = items.find(i => i.id === activeId);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      
      {/* TIERMAKER UI: Darker background, tighter padding */}
      <div className="min-h-screen bg-[#111111] text-white p-2 md:p-6 font-sans flex flex-col items-center">
        
        <div className="w-full max-w-4xl mb-4 self-start md:self-auto md:w-full">
          <Link to="/" className="text-gray-400 hover:text-gray-200 font-semibold transition-colors flex items-center gap-2">
            ← Back to Menu
          </Link>
        </div>
        
        {/* TIERMAKER UI: The Grid Layout */}
        <div className="w-full max-w-4xl flex flex-col border-2 border-black bg-[#1a1a1a] mb-12">
          {TIERS.map((tier) => (
            // TIERMAKER UI: Thinner rows (min-h-[80px]), thin black borders dividing them
            <div key={tier.id} className="flex border-b border-black min-h-[64px] md:min-h-[80px]">
              
              <div className={`${tier.color} w-20 md:w-24 shrink-0 flex items-center justify-center text-xl md:text-2xl font-bold text-black border-r border-black`}>
                {tier.label}
              </div>
              
              {/* TIERMAKER UI: Extremely dense gap-1 so items sit flush with each other */}
              <SortableZone id={tier.id} items={items.filter(item => item.tier === tier.id)} className="flex-1 p-1 flex flex-wrap content-start gap-1" />
            
            </div>
          ))}
        </div>
        
        {/* Input & Upload Controls */}
        <div className="w-full max-w-4xl px-2 md:px-0">
          <div className="mb-6 bg-gray-800 p-4 rounded border border-gray-700 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center">
            
            <form onSubmit={handleAddText} className="flex gap-2 w-full md:w-auto">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Type a label..." className="flex-1 md:w-64 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded shadow">Add Text</button>
            </form>

            <span className="text-gray-500 font-bold hidden md:block">OR</span>

            {/* The Image Upload Button */}
            <label className="w-full md:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded shadow cursor-pointer text-center">
              Upload Image
              {/* The actual HTML file input is hidden, clicking the label triggers it! */}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>

          </div>

          {/* Unranked Pool */}
          <SortableZone id="pool" items={items.filter(item => item.tier === 'pool')} className="bg-[#1a1a1a] border-2 border-black min-h-[150px] p-2 flex flex-wrap content-start gap-1 shadow-xl" />
        </div>
      </div>
      
      {/* The Visual Ghost that follows your mouse */}
      <DragOverlay>
        {activeId ? (
          <div className="w-16 h-16 md:w-20 md:h-20 touch-none bg-gray-700 flex items-center justify-center text-center font-bold text-xs md:text-sm shadow-2xl opacity-90 scale-110 cursor-grabbing overflow-hidden">
            {activeItemData?.image ? (
              <img src={activeItemData.image} alt="dragging" className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <span className="p-1 break-words">{activeItemData?.label}</span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}