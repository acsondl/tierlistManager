//https://linux.tail2f8d37.ts.net:8444/

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, pointerWithin, PointerSensor, useSensor, useSensors, TouchSensor, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// REPLACE WITH YOUR TAILSCALE IP
const BACKEND_URL = "https://linux.tail2f8d37.ts.net:8444/api/lists";

// NEW: The Draggable List Component
function SortableListCard({ list, onDelete }: { list: any, onDelete: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : 1 };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      className="bg-gray-800 p-6 rounded-xl border border-gray-700 hover:border-blue-500 shadow-lg relative cursor-grab active:cursor-grabbing touch-none flex flex-col items-center group"
    >
      {/* 
        onPointerDown={e => e.stopPropagation()} tells the physics engine:
        "If they click this button, do NOT count it as a drag attempt!" 
      */}
      <button 
        onPointerDown={(e) => e.stopPropagation()} 
        onClick={(e) => onDelete(e, list.id)} 
        className="absolute top-3 right-3 text-gray-500 hover:text-red-500 hover:bg-red-500/20 p-2 rounded-full transition-all"
        title="Delete List"
      >
        🗑️
      </button>

      <h2 className="text-2xl font-bold text-gray-100 group-hover:text-blue-400 mt-2 mb-4">{list.name}</h2>
      
      {/* The explicit open button prevents accidental navigation when dragging */}
      <Link 
        onPointerDown={(e) => e.stopPropagation()} 
        to={`/editor/${list.id}`} 
        className="mt-auto bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg text-white font-bold shadow-md transition-transform hover:scale-105"
      >
        Open Editor
      </Link>
    </div>
  );
}

export default function Home() {
  const [tierLists, setTierLists] = useState<any[]>([]);
  const [newListName, setNewListName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }) 
  );

  useEffect(() => {
    fetch(BACKEND_URL)
      .then(response => response.json())
      .then(data => { if (data) setTierLists(data); })
      .catch(error => console.error("Error fetching tier lists:", error));
  }, []);

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListName.trim() === '') return;

    fetch(BACKEND_URL + "/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName.trim() })
    })
      .then(response => response.json())
      .then(newList => {
        // Since the backend sets OrderIndex to 0 (top), we prepend it locally!
        setTierLists([newList, ...tierLists]);
        setNewListName(''); 
      })
      .catch(error => console.error("Error creating list:", error));
  };

  const handleDeleteList = (e: React.MouseEvent, id: number) => {
    e.preventDefault(); 
    if (!window.confirm("Are you sure you want to permanently delete this list?")) return;

    fetch(`${BACKEND_URL}?id=${id}`, { method: 'DELETE' })
      .then(() => setTierLists(prev => prev.filter(list => list.id !== id)))
      .catch(err => console.error("Error deleting list:", err));
  };

  // NEW: Logic to save the new order when you drag a list
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tierLists.findIndex(list => list.id === active.id);
    const newIndex = tierLists.findIndex(list => list.id === over.id);

    const reorderedLists = arrayMove(tierLists, oldIndex, newIndex);
    
    // Update the local index numbers
    const finalLists = reorderedLists.map((list, index) => ({ ...list, order_index: index }));
    setTierLists(finalLists);

    // Tell Postgres to save the new order
    fetch(BACKEND_URL + "/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalLists)
    }).catch(err => console.error("Error saving list order:", err));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center font-sans">
      <h1 className="text-5xl font-bold mb-10 text-gray-100 mt-10">My Tier Lists</h1>
      
      <form onSubmit={handleCreateList} className="flex gap-3 mb-16 w-full max-w-md">
        <input type="text" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="New Tier List Name..." className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors shadow-lg" />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-colors">Create</button>
      </form>

      {/* NEW: The Physics Engine Wrap */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tierLists.map(l => l.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
            {tierLists.map((list) => (
              <SortableListCard key={list.id} list={list} onDelete={handleDeleteList} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      
    </div>
  );
}