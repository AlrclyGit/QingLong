/**
 * 任务名称
 * name: 俊介：百度贴吧签到
 * 定时规则
 * cron: 1 15 * * *
 */

// 导入
const axios = require('axios');
const md5 = require('blueimp-md5');

// 获取用户的 Tab
const tbsURL = 'http://tieba.baidu.com/dc/common/tbs';
// 获取用户所有关注贴吧
const likeURL = 'https://tieba.baidu.com/mo/q/newmoindex';
// 贴吧签到接口
const signURL = 'http://c.tieba.baidu.com/c/c/forum/sign';
// 登录令牌
const tiebaCookie = process.env.BAIDUTBS;

// 未签到的贴吧列表
let notSignIn = [];
// 签到成功的贴吧列表
let successSignIn = [];
// 用户所关注的贴吧数量
let signInNum = 0;
// 登录密钥
let tbs;

async function signInToTieba() {
  try {
    // 设置请求头
    const headers = {
      headers: {
        cookie: tiebaCookie,
      },
    };
    // 获取用户的 Tab
    const res = await axios.get(tbsURL, headers);
    // 获取密钥
    if (res.data.is_login === 1) {
      //成果
      console.log('获取密钥成功');
      tbs = res.data.tbs;
    } else {
      //失败
      console.log('获取密钥失败');
      QLAPI.notify('百度贴吧签到', '获取 tbs 失败');
      return;
    }
    // 获取用户所有关注贴吧
    const likeRes = await axios.get(likeURL, headers);
    console.log(`获取贴吧列表成功`);
    // 贴吧列表
    let likeForum = likeRes.data.data.like_forum;
    // 用户所关注的贴吧数量
    signInNum = likeForum.length;
    // 判断是否签到
    likeForum.forEach((element) => {
      if (element.is_sign === 0) {
        // 未签到的贴吧列表
        notSignIn.push(element.forum_name.replace('+', '%2B'));
      } else {
        // 签到成功的贴吧列表
        successSignIn.push(element.forum_name);
      }
    });
    // 输出结果
    console.log(`需要签到的贴吧：${notSignIn}`);
    console.log(`已经签到的贴吧：${successSignIn}`);
    console.log(`还剩 ${signInNum - successSignIn.length} 个贴吧需要签到`);
    // 签到开始
    if (notSignIn.length !== 0) {
      console.log(`-----签到开始-----`);

      for (let i = 0; i < notSignIn.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 12345)); // 等待指定时间
        // 构建签到贴吧的 sign
        let rotation = notSignIn[i].replace('%2B', '+');
        let sign = md5(`kw=${rotation}tbs=${tbs}tiebaclient!!!`);
        console.log(`「${rotation}」签到开始`);
        try {
          const signRes = await axios.get(signURL, {
            headers: {
              cookie: tiebaCookie,
            },
            params: {
              kw: notSignIn[i],
              tbs: tbs,
              sign: sign,
            },
          });

          if (signRes.data.error_code == 0) {
            successSignIn.push(rotation);
            console.log(`「${rotation}」签到成功`);
            if (successSignIn.length == signInNum) console.log(`-----签到结束-----`);
          } else {
            console.log(signRes);
            console.log(`「${rotation}」签到失败`);
            QLAPI.notify('百度贴吧签到', `「${rotation}」签到失败`);
          }
        } catch (error) {
          console.error(`❗️  运行错误！\n${error}`);
          QLAPI.notify('百度贴吧签到', '百度贴吧签到运行错误！');
        }
      }
    }
  } catch (error) {
    console.error(`❗️  获取数据失败！\n${error}`);
    QLAPI.notify('百度贴吧签到', '获取数据失败！');
  }
}

// 调用函数
signInToTieba();
