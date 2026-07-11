// v1 chat sidebar: LEFT sliding panel, toggle handle riding its right edge
// with an unread badge, feed, emoji row + compose form.
import { useEffect } from 'react';
import { useStore } from '../../state/store.js';
import MessageFeed from './MessageFeed.jsx';
import ChatInput from './ChatInput.jsx';

export default function ChatSidebar() {
  const open = useStore(s => s.chatOpen);
  const unread = useStore(s => s.unread);
  const setChat = useStore(s => s.setChat);
  const ownerName = useStore(s => s.garden.ownerName);
  const isVisitor = useStore(s => s.isVisitor);

  useEffect(() => { setChat(window.innerWidth >= 900); }, []); // open by default on wide screens

  return (
    <aside id="chatbar" className={open ? 'open' : ''} aria-label="plant group chat">
      <button id="chat-toggle" aria-label="toggle chat" onClick={() => setChat(!open)}>
        {open ? '<' : '>'}
        {unread > 0 && <span className="cbadge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <div id="feed-title">{isVisitor && ownerName ? `${ownerName}'s plant group chat` : 'plant group chat'}</div>
      <MessageFeed />
      <ChatInput />
    </aside>
  );
}
