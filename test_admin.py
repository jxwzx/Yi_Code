import urllib.request
import json

BASE = 'http://127.0.0.1:8004'

def test_set_role(user_id, role, operator_id=None):
    url = f'{BASE}/admin/users/{user_id}/role?role={role}'
    if operator_id:
        url += f'&operator_id={operator_id}'
    req = urllib.request.Request(url, method='POST')
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print(f'设置用户 {user_id} 为 {role}:', result)
        return result
    except Exception as e:
        print(f'设置用户 {user_id} 为 {role} 失败:', e)
        return None

if __name__ == '__main__':
    # 设置用户8为管理员
    print('=== 测试设置管理员 ===')
    test_set_role(8, 'admin', operator_id=1)  # 使用超管(ID=1)操作
    
    # 再测试获取用户列表
    print('\n=== 更新后的用户列表 ===')
    req = urllib.request.Request(f'{BASE}/admin/users')
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    for u in result['users']:
        print(f"  ID={u['id']} | {u['username']} | role={u['role']} | target_id={u['target_id']}")
