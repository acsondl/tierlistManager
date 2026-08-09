import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// REPLACE WITH YOUR TAILSCALE IP
const BACKEND_URL = "https://linux.tail2f8d37.ts.net:8444/api/lists";

export default function Home() {
  const [tierLists, setTierLists] = useState<any[]>([]);
  const [newListName, setNewListName] = useState('');

  useEffect(() => {
    fetch(BACKEND_URL)
      .then(response => response.json())
      .then(data => {
        if (data) setTierLists(data);
      })
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
        setTierLists([...tierLists, newList]);
        setNewListName(''); 
      })
      .catch(error => console.error("Error creating list:", error));
  };

  // NEW: Delete a list
  const handleDeleteList = (e: React.MouseEvent, id: number) => {
    e.preventDefault(); // Prevents the Link from opening the editor when we click the trash can
    
    if (!window.confirm("Are you sure you want to permanently delete this list?")) return;

    fetch(`${BACKEND_URL}?id=${id}`, { method: 'DELETE' })
      .then(() => {
        // Remove it from the screen instantly
        setTierLists(prev => prev.filter(list => list.id !== id));
      })
      .catch(err => console.error("Error deleting list:", err));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center font-sans">
      <h1 className="text-5xl font-bold mb-10 text-gray-100 mt-10">My Tier Lists</h1>
      
      <form onSubmit={handleCreateList} className="flex gap-3 mb-16 w-full max-w-md">
        <input type="text" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="New Tier List Name..." className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors shadow-lg" />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-colors">Create</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
        {tierLists.map((list) => (
          <Link to={`/editor/${list.id}`} key={list.id} className="bg-gray-800 p-8 rounded-xl border border-gray-700 hover:border-blue-500 hover:bg-gray-750 transition-all shadow-lg hover:shadow-xl group flex flex-col items-center text-center cursor-pointer relative">
            
            {/* The Trash Button */}
            <button 
              onClick={(e) => handleDeleteList(e, list.id)} 
              className="absolute top-3 right-3 text-gray-500 hover:text-red-500 hover:bg-red-500/20 p-2 rounded-full transition-all"
              title="Delete List"
            >
              🗑️
            </button>

            <h2 className="text-2xl font-bold group-hover:text-blue-400 transition-colors">{list.name}</h2>
            <p className="text-gray-500 mt-4 text-sm">Click to edit</p>
          </Link>
        ))}
      </div>
    </div>
  );
}