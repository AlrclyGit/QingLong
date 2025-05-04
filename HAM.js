/**
 * 任务名称
 * name: 俊介：业余无线电考试报名
 * 定时规则
 * cron: 23 * * * *
 */

// 登录令牌
const hamKey = process.env.HAMKEY;
// 获取列表
const getListURL = 'http://82.157.138.16:8091/CRAC/app/exam_exam/getExamList';

async function getList() {
  // 构建请求体
  const body = JSON.stringify({
    req: {
      province: '1681', // 省份
      type: 'A', // 类型
      page_no: 1,
      page_size: 10,
    },
    req_meta: {
      user_id: hamKey, // 用户 ID
    },
  });
  // 设置请求头
  const headers = {
    'Content-Type': 'application/json',
  };
  // 发送请求
  try {
    const response = await fetch(getListURL, {
      method: 'POST',
      headers,
      body,
    });
    // 当 HTTP 状态码在 200-299 范围内时为 true
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // 获取数据，并处理
    const data = await response.json();
    if (data.code === 10010) {
      console.log('湖北业余无线电无考试');
    } else {
      console.log('获取到业余无线电考试报名考试安排');
      QLAPI.notify('获取到业余无线电考试报名考试安排');
    }
  } catch (error) {
    console.error('网络请求发生错误', error);
    QLAPI.notify('网络错误：湖北业余无线电无考试');
  }
}

// 调用函数
getList();
