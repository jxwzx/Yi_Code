import urllib.request
import json

BASE = 'http://127.0.0.1:8004'

def test_register():
    data = json.dumps({
        'username': 'new_test_user2',
        'password': '123456',
        'email': 'newtest2@example.com'
    }).encode('utf-8')
    req = urllib.request.Request(f'{BASE}/auth/register', data=data, headers={'Content-Type': 'application/json'})
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print('注册成功:', result)
        return result
    except Exception as e:
        print('注册失败:', e)
        return None

def test_login(username, password):
    data = json.dumps({'username': username, 'password': password}).encode('utf-8')
    req = urllib.request.Request(f'{BASE}/auth/login', data=data, headers={'Content-Type': 'application/json'})
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print('登录成功:', result)
        return result
    except Exception as e:
        print('登录失败:', e)
        return None

def test_admin_users():
    req = urllib.request.Request(f'{BASE}/admin/users')
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print('用户列表:', result['count'], '个用户')
        for u in result['users']:
            print(f"  ID={u['id']} | {u['username']} | role={u['role']} | target_id={u['target_id']}")
        return result
    except Exception as e:
        print('获取用户列表失败:', e)
        return None

if __name__ == '__main__':
    print('=== 测试注册 ===')
    reg_result = test_register()
    
    print('\n=== 测试登录 ===')
    if reg_result:
        login_result = test_login('new_test_user2', '123456')
    
    print('\n=== 测试管理员接口 ===')
    test_admin_users()
