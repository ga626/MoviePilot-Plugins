"""V7 才读取的隐藏答案；V3 输入编译和模型调用不得导入本模块。"""
from __future__ import annotations


LAB_TRUTH = {
    "lab_forrest_gump": [
        {"title": "Forrest Gump", "year": 1994, "media_type": "movie", "presentation": "live_action"},
    ],
    "lab_one_piece_live": [
        {"title": "One Piece", "year": 2023, "media_type": "tv", "presentation": "live_action"},
    ],
    "lab_cowboy_bebop_anime": [
        {"title": "Cowboy Bebop", "year": 1998, "media_type": "tv", "presentation": "animation"},
    ],
    "lab_two_movies": [
        {"title": "The Matrix", "year": 1999, "media_type": "movie", "presentation": "live_action"},
        {"title": "The Matrix Reloaded", "year": 2003, "media_type": "movie", "presentation": "live_action"},
    ],
    "lab_multi_season": [
        {"title": "Dark", "year": 2017, "media_type": "tv", "presentation": "live_action"},
    ],
}
