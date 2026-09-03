# YiCode 课堂管理服务
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import json
import asyncio

app = FastAPI(title="YiCode Classroom Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 存储教室信息
classrooms: Dict[str, Dict[str, Any]] = {}
# 存储WebSocket连接
connections: Dict[str, List[WebSocket]] = {}

@app.get("/")
async def root():
    return {"message": "YiCode Classroom Service"}

@app.get("/classrooms")
async def list_classrooms():
    """列出所有教室"""
    return {"classrooms": list(classrooms.keys())}

@app.post("/classrooms/{classroom_id}")
async def create_classroom(classroom_id: str, name: str = ""):
    """创建教室"""
    if classroom_id in classrooms:
        raise HTTPException(status_code=400, detail="Classroom already exists")
    
    classrooms[classroom_id] = {
        "id": classroom_id,
        "name": name or classroom_id,
        "students": [],
        "teacher": None,
        "created_at": "2026-09-03"
    }
    connections[classroom_id] = []
    return {"message": f"Classroom {classroom_id} created"}

@app.websocket("/ws/classroom/{classroom_id}")
async def websocket_classroom(websocket: WebSocket, classroom_id: str):
    """WebSocket连接处理"""
    if classroom_id not in classrooms:
        await websocket.close(code=4004, reason="Classroom not found")
        return
    
    await websocket.accept()
    connections[classroom_id].append(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # 广播消息给同一教室的所有连接
            for connection in connections[classroom_id]:
                if connection != websocket:
                    try:
                        await connection.send_text(json.dumps({
                            "type": "message",
                            "from": message.get("from", "anonymous"),
                            "content": message.get("content", ""),
                            "classroom_id": classroom_id
                        }))
                    except:
                        # 移除断开的连接
                        connections[classroom_id].remove(connection)
                        
    except WebSocketDisconnect:
        connections[classroom_id].remove(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if websocket in connections[classroom_id]:
            connections[classroom_id].remove(websocket)

@app.post("/classrooms/{classroom_id}/broadcast")
async def broadcast_message(classroom_id: str, message: Dict[str, Any]):
    """广播消息到教室"""
    if classroom_id not in connections:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    for connection in connections[classroom_id]:
        try:
            await connection.send_text(json.dumps(message))
        except:
            connections[classroom_id].remove(connection)
    
    return {"message": f"Broadcast sent to {len(connections[classroom_id])} connections"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
