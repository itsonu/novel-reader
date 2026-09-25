// Remounted on every navigation between routes (not on query-string changes, which is
// how chapters change — the reader animates those itself). One short rise, CSS only,
// so it plays before hydration and costs nothing.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
