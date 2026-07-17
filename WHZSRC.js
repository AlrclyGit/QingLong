/**
 * 任务名称
 * name: 武汉掌上人才考试报名
 * 定时规则
 * cron: 23 * * * *
 */

//
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
//
const whzsrcURL = 'https://www.whzsrc.com/hanpintong/dev-api/page/site/notice/getNoticeList';
const storageFile = path.join(__dirname, 'whzsrc_last_title.txt');
async function getList() {
  // 构建请求体
  const whzsrcData = {
    ggbt: '',
    gglx: 1,
    pageNum: 1,
    PageSize: 10,
  };
  // 设置请求头
  const whzsrcConfig = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  //
  try {
    const res = await axios.post(whzsrcURL, whzsrcData, whzsrcConfig);
    if (res.data.code === 200) {
      let rowsOneTitle = res.data.rows[0].ggbt;
      console.log('当前标题：', rowsOneTitle);

      // 读取上次保存的标题
      let lastTitle = '';
      try {
        lastTitle = await fs.readFile(storageFile, 'utf8');
        console.log('上次保存的标题：', lastTitle);
      } catch (readError) {
        // 文件不存在是正常情况
        console.log('首次运行，无上次保存的标题');
      }
      // 对比标题
      if (lastTitle !== rowsOneTitle) {
        console.log('标题发生变化！');
        // 保存新标题
        await fs.writeFile(storageFile, rowsOneTitle, 'utf8');
        console.log('已保存新标题');
        // 发送通知（如果有 QLAPI）
        QLAPI.systemNotify({
          title: '武汉掌上人才报名监控',
          content: `标题已更新：${rowsOneTitle}`,
        });
      } else {
        console.log('标题未发生变化');
      }
    } else {
      console.error(`❗️获取数据失败！状态码：${res.data.code}`);

      QLAPI.systemNotify({ title: '武汉掌上人才报名监控', content: '接口请求失败' });
    }
  } catch (error) {
    console.error(`❗️获取数据失败！\n${error}`);
    QLAPI.systemNotify({ title: '武汉掌上人才报名监控', content: '接口请求失败' });
  }
}

// 调用函数
getList();
