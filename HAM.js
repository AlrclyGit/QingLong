/**
 * 任务名称
 * name: 俊介：业余无线电考试报名
 * 定时规则
 * cron: 23 * * * *
 */

//
const axios = require('axios');
// 登录令牌
const hamKey = process.env.HAMKEY;
//
const getListURL = 'http://82.157.138.16:8091/CRAC/app/exam_exam/getExamList';

async function getList() {
  // 构建请求体
  const data = {
    req: {
      province: '1681',
      page_no: 1,
      page_size: 10,
      type: 'A',
    },
    req_meta: {
      user_id: hamKey,
    },
  };
  const config = {
    headers: {
      'Content-Type': 'application/json', // 设置请求头
    },
  };
  try {
    const res = await axios.post(getListURL, data, config);
    if (res.data.code === 10010) {
      console.log('湖北业余无线电无考试');
    } else {
      console.log('获取到业余无线电考试报名考试安排');
      QLAPI.notify('获取到业余无线电考试报名考试安排', JSON.stringify(res.data));
    }
  } catch (error) {
    console.error(`❗️  获取数据失败！\n${error}`);
    QLAPI.notify('业余无线电考试报名监控', '接口请求失败');
  }
}

// 调用函数
getList();
