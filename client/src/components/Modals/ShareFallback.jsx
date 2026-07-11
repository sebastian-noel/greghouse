export default function ShareFallback({ url }) {
  return (
    <>
      <h2>share your garden</h2>
      <p className="mini">copy this link:</p>
      <input type="text" value={url} onClick={e => e.target.select()} readOnly />
    </>
  );
}
