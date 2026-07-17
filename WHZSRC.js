/**
 * 任务名称
 * name: 业余无线电考试报名
 * 定时规则
 * cron: 23 * * * *
 */

//
const axios = require('axios');
// 登录令牌
const hamKey = process.env.HAMKEY;
//
const whzsrcURL = 'https://www.whzsrc.com/hanpintong/procalmationAllLists?type=1&zxlb=178';
async function getList() {
  // 构建请求体
  const whzsrcData = {};
  // 设置请求头
  const whzsrcConfig = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  //
  try {
    const res = await axios.post(getListURL, whzsrcData, whzsrcConfig);
    console.log(res.data.code);
    // if (res.data.code === 10010) {
    //   console.log('湖北业余无线电无考试');
    // } else {
    //   console.log('获取到业余无线电考试报名考试安排');
    //   QLAPI.systemNotify({ title: '获取到业余无线电考试报名考试安排', content: JSON.stringify(res.data) });
    // }
  } catch (error) {
    console.error(`❗️获取数据失败！\n${error}`);
    // QLAPI.systemNotify({ title: '业余无线电考试报名监控', content: '接口请求失败' });
  }
}

// 调用函数
getList();
