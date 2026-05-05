from __future__ import annotations

from genealogy import build_genealogy_graph


def build_genealogy_graph_payload(store) -> dict:
    return build_genealogy_graph(store.list_all(), store.list_genealogy_positions())


def update_genealogy_node_positions(store, payload: dict) -> dict:
    raw_positions = payload.get("positions")
    if not isinstance(raw_positions, dict):
        raise ValueError("节点位置列表格式错误。")
    positions = store.update_genealogy_node_positions(raw_positions)
    return {
        "ok": True,
        "positions": positions,
        "updated_count": len(positions),
    }
